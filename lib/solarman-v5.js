'use strict';

const net = require('net');

/**
 * Compute Modbus RTU CRC-16 (poly 0xA001, init 0xFFFF).
 * Returns 16-bit unsigned integer (append Low byte first, High byte second).
 */
function crc16Modbus(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xffff;
}

/**
 * Compute Solarman V5 8-bit checksum over bytes [1 .. len - 3].
 */
function solarmanChecksum(buf) {
  let sum = 0;
  for (let i = 1; i < buf.length - 2; i++) {
    sum = (sum + buf[i]) & 0xff;
  }
  return sum;
}

function buildModbusReadFrame(unitId, functionCode, startAddress, count) {
  const pdu = Buffer.alloc(6);
  pdu[0] = unitId & 0xff;
  pdu[1] = functionCode & 0xff;
  pdu.writeUInt16BE(startAddress, 2);
  pdu.writeUInt16BE(count, 4);

  const crc = crc16Modbus(pdu);
  const frame = Buffer.alloc(8);
  pdu.copy(frame, 0);
  frame.writeUInt16LE(crc, 6);
  return frame;
}

function buildModbusWriteMultipleFrame(unitId, startAddress, values) {
  const count = values.length;
  const byteCount = count * 2;
  const pdu = Buffer.alloc(7 + byteCount);
  pdu[0] = unitId & 0xff;
  pdu[1] = 0x10; // Preset Multiple Registers (required by Deye firmware)
  pdu.writeUInt16BE(startAddress, 2);
  pdu.writeUInt16BE(count, 4);
  pdu[6] = byteCount;
  for (let i = 0; i < count; i++) {
    pdu.writeUInt16BE(values[i] & 0xffff, 7 + i * 2);
  }
  const crc = crc16Modbus(pdu);
  const frame = Buffer.alloc(pdu.length + 2);
  pdu.copy(frame, 0);
  frame.writeUInt16LE(crc, pdu.length);
  return frame;
}

function wrapSolarmanV5(loggerSn, sequence, modbusFrame) {
  const payloadLength = 15 + modbusFrame.length;
  const packet = Buffer.alloc(11 + payloadLength + 2);

  packet[0] = 0xa5;
  packet.writeUInt16LE(payloadLength, 1);
  packet.writeUInt16LE(0x4510, 3);
  packet.writeUInt16LE(sequence & 0xffff, 5);
  packet.writeUInt32LE(Number(loggerSn) >>> 0, 7);

  packet[11] = 0x02; // Solar Inverter
  packet.writeUInt16LE(0x0000, 12); // Sensor type
  // Delivery/PowerOn/Offset timers [14..25] remain 0
  modbusFrame.copy(packet, 26);

  packet[packet.length - 2] = solarmanChecksum(packet);
  packet[packet.length - 1] = 0x15;
  return packet;
}

function unwrapSolarmanV5(buffer) {
  if (buffer.length < 29) {
    throw new Error(`Solarman V5 response too short (${buffer.length} bytes)`);
  }
  if (buffer[0] !== 0xa5 || buffer[buffer.length - 1] !== 0x15) {
    throw new Error('Invalid Solarman V5 start/end frame delimiters');
  }
  const expectedSum = solarmanChecksum(buffer);
  const actualSum = buffer[buffer.length - 2];
  if (expectedSum !== actualSum) {
    throw new Error(
      `Solarman V5 checksum mismatch: expected 0x${expectedSum.toString(16)}, got 0x${actualSum.toString(16)}`
    );
  }

  const controlCode = buffer.readUInt16LE(3);
  if (controlCode !== 0x1510) {
    throw new Error(`Unexpected control code 0x${controlCode.toString(16)}`);
  }

  // Response payload prefix is 14 bytes (25..end-3 is Modbus RTU ADU)
  const modbus = buffer.subarray(25, buffer.length - 2);
  if (modbus.length < 5) {
    throw new Error('Embedded Modbus RTU frame truncated');
  }

  const pdu = modbus.subarray(0, modbus.length - 2);
  const crcExpected = crc16Modbus(pdu);
  const crcActual = modbus.readUInt16LE(modbus.length - 2);
  if (crcExpected !== crcActual) {
    throw new Error('Modbus RTU CRC-16 verification failed');
  }

  const fc = pdu[1];
  if (fc & 0x80) {
    throw new Error(`Modbus exception 0x${pdu[2].toString(16)} on FC 0x${(fc & 0x7f).toString(16)}`);
  }

  if (fc === 0x03 || fc === 0x04) {
    const byteCount = pdu[2];
    const registers = [];
    for (let i = 0; i < byteCount; i += 2) {
      registers.push(pdu.readUInt16BE(3 + i));
    }
    return { functionCode: fc, registers };
  }

  return {
    functionCode: fc,
    startAddress: pdu.readUInt16BE(2),
    quantity: pdu.readUInt16BE(4),
  };
}

class SolarmanV5Client {
  constructor(options) {
    this.host = options.host;
    this.port = Number(options.port) || 8899;
    this.loggerSn = Number(options.loggerSn);
    this.unitId = Number(options.unitId) || 1;
    this.timeout = Number(options.timeout) || 3000;
    this.retries = options.retries !== undefined ? Number(options.retries) : 1;
    this.sequence = 1;
    this._queue = Promise.resolve();
  }

  nextSequence() {
    this.sequence = (this.sequence + 1) & 0xffff;
    if (this.sequence === 0) this.sequence = 1;
    return this.sequence;
  }

  sendRawFrame(v5Packet) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const chunks = [];

      const finish = (err, data) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(data);
      };

      socket.setTimeout(this.timeout);
      socket.on('timeout', () => finish(new Error(`TCP timeout after ${this.timeout}ms`)));
      socket.on('error', (err) => finish(err));
      socket.on('close', () => {
        if (!settled) {
          finish(new Error('TCP connection closed by dongle before complete V5 response'));
        }
      });

      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const combined = Buffer.concat(chunks);
        if (combined.length >= 13 && combined[0] === 0xa5) {
          const declaredLen = combined.readUInt16LE(1);
          if (combined.length >= declaredLen + 13) {
            try {
              const frame = combined.subarray(0, declaredLen + 13);
              const parsed = unwrapSolarmanV5(frame);
              finish(null, parsed);
            } catch (parseErr) {
              finish(parseErr);
            }
          }
        }
      });

      socket.connect(this.port, this.host, () => {
        socket.write(v5Packet);
      });
    });
  }

  enqueue(taskFn) {
    const run = this._queue.then(taskFn, taskFn);
    this._queue = run.catch(() => {});
    return run;
  }

  async readRegisters(startAddress, count, functionCode = 0x03) {
    return this.enqueue(async () => {
      let lastErr;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const modbus = buildModbusReadFrame(this.unitId, functionCode, startAddress, count);
          const v5 = wrapSolarmanV5(this.loggerSn, this.nextSequence(), modbus);
          const res = await this.sendRawFrame(v5);
          return res.registers;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    });
  }

  async writeRegisters(startAddress, values) {
    return this.enqueue(async () => {
      const modbus = buildModbusWriteMultipleFrame(this.unitId, startAddress, values);
      const v5 = wrapSolarmanV5(this.loggerSn, this.nextSequence(), modbus);
      return this.sendRawFrame(v5);
    });
  }
}

module.exports = {
  SolarmanV5Client,
  crc16Modbus,
  solarmanChecksum,
  buildModbusReadFrame,
  buildModbusWriteMultipleFrame,
  wrapSolarmanV5,
  unwrapSolarmanV5,
};
