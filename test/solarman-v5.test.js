'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const {
  SolarmanV5Client,
  crc16Modbus,
  solarmanChecksum,
  buildModbusReadFrame,
  wrapSolarmanV5,
  unwrapSolarmanV5,
} = require('../lib/solarman-v5');
const {
  decodeRegister,
  encodeRtcWords,
  resolvePreset,
  resolveRtcSync,
} = require('../lib/registers');

function buildMockSolarmanResponse(loggerSn, sequence, modbusPdu) {
  const crc = crc16Modbus(modbusPdu);
  const modbusFrame = Buffer.alloc(modbusPdu.length + 2);
  modbusPdu.copy(modbusFrame, 0);
  modbusFrame.writeUInt16LE(crc, modbusPdu.length);

  const payloadLength = 14 + modbusFrame.length;
  const packet = Buffer.alloc(11 + payloadLength + 2);
  packet[0] = 0xa5;
  packet.writeUInt16LE(payloadLength, 1);
  packet.writeUInt16LE(0x1510, 3);
  packet.writeUInt16LE(sequence & 0xffff, 5);
  packet.writeUInt32LE(Number(loggerSn) >>> 0, 7);
  packet[11] = 0x02;
  packet[12] = 0x01;
  modbusFrame.copy(packet, 25);
  packet[packet.length - 2] = solarmanChecksum(packet);
  packet[packet.length - 1] = 0x15;
  return packet;
}

function createMockRedHarness(client, series = 'SG01HP3') {
  const registered = new Map();
  const mockRED = {
    nodes: {
      registerType(name, ctor) {
        registered.set(name, ctor);
      },
      createNode(node, cfg) {
        Object.assign(node, cfg);
        node._handlers = {};
        node.statuses = [];
        node.errors = [];
        node.on = (evt, fn) => {
          node._handlers[evt] = fn;
        };
        node.status = (s) => {
          node.statuses.push(s);
        };
        node.error = (err, msg) => {
          node.errors.push({ err, msg });
        };
      },
      getNode(id) {
        if (!id) return null;
        return { host: '127.0.0.1', port: 8899, loggerSn: 2712345678, series, client };
      },
    },
  };

  require('../nodes/deye-solarman-config')(mockRED);
  require('../nodes/deye-read')(mockRED);
  require('../nodes/deye-write')(mockRED);

  return { mockRED, registered };
}

function invokeReadNode(node, msg) {
  return new Promise((resolve) => {
    let outputs = null;
    node._handlers.input(
      msg,
      (out) => {
        outputs = out;
      },
      (err) => {
        resolve({ outputs, err });
      }
    );
  });
}

test('Solarman V5 wrap and Modbus CRC-16 checksum calculation', () => {
  const modbus = buildModbusReadFrame(1, 0x03, 588, 1);
  assert.equal(modbus.length, 8);
  assert.equal(modbus[0], 0x01);
  assert.equal(modbus[1], 0x03);
  assert.equal(modbus.readUInt16BE(2), 588);
  assert.equal(modbus.readUInt16BE(4), 1);

  const v5 = wrapSolarmanV5(2712345678, 7, modbus);
  assert.equal(v5[0], 0xa5);
  assert.equal(v5[v5.length - 1], 0x15);
  assert.equal(v5.readUInt16LE(3), 0x4510);
  assert.equal(v5.readUInt16LE(5), 7);
  assert.equal(v5.readUInt32LE(7), 2712345678);
});

test('unwrapSolarmanV5 parses valid 0x1510 response and rejects corrupted frames', () => {
  const pdu = Buffer.from([0x01, 0x03, 0x04, 0x13, 0x88, 0x00, 0x55]);
  const resp = buildMockSolarmanResponse(2712345678, 1, pdu);
  const parsed = unwrapSolarmanV5(resp);
  assert.equal(parsed.functionCode, 0x03);
  assert.deepEqual(parsed.registers, [5000, 85]);

  const badSum = Buffer.from(resp);
  badSum[badSum.length - 2] ^= 0xff;
  assert.throws(() => unwrapSolarmanV5(badSum), /checksum mismatch/i);
});

test('decodeRegister handles int16, uint32_le_words, hhmm, packed_bytes, and BOS-G HV scaling', () => {
  assert.equal(
    decodeRegister({ address: 590, dataType: 'int16', scale: 10, offset: 0 }, [0xffce], 590),
    -500
  );
  assert.equal(
    decodeRegister({ address: 587, dataType: 'uint16', scale: 0.1, offset: 0 }, [5124], 587),
    512.4
  );
  assert.equal(
    decodeRegister(
      { address: 522, dataType: 'uint32_le_words', scale: 0.1, offset: 0 },
      [0x0010, 0x0001],
      522
    ),
    6555.2
  );
  assert.equal(
    decodeRegister({ address: 148, dataType: 'hhmm', scale: 1, offset: 0 }, [1830], 148),
    '18:30'
  );

  const rtcWords = encodeRtcWords(new Date(2026, 10, 15, 17, 10, 42));
  assert.deepEqual(
    decodeRegister({ address: 62, dataType: 'packed_bytes', scale: 1, offset: 0 }, rtcWords, 62),
    { high: 26, low: 11 }
  );
  assert.deepEqual(
    decodeRegister({ address: 63, dataType: 'packed_bytes', scale: 1, offset: 0 }, rtcWords, 62),
    { high: 15, low: 17 }
  );
  assert.deepEqual(
    decodeRegister({ address: 64, dataType: 'packed_bytes', scale: 1, offset: 0 }, rtcWords, 62),
    { high: 10, low: 42 }
  );
});

test('SolarmanV5Client reads and writes over TCP loopback socket', async () => {
  const server = net.createServer((socket) => {
    socket.on('data', (req) => {
      const seq = req.readUInt16LE(5);
      const sn = req.readUInt32LE(7);
      const modbusReq = req.subarray(26, req.length - 2);
      const fc = modbusReq[1];

      if (fc === 0x03) {
        const start = modbusReq.readUInt16BE(2);
        const qty = modbusReq.readUInt16BE(4);
        const pdu = Buffer.alloc(3 + qty * 2);
        pdu[0] = modbusReq[0];
        pdu[1] = 0x03;
        pdu[2] = qty * 2;
        for (let i = 0; i < qty; i++) {
          pdu.writeUInt16BE(start + i, 3 + i * 2);
        }
        socket.write(buildMockSolarmanResponse(sn, seq, pdu));
      } else if (fc === 0x10) {
        const pdu = Buffer.alloc(6);
        pdu[0] = modbusReq[0];
        pdu[1] = 0x10;
        pdu.writeUInt16BE(modbusReq.readUInt16BE(2), 2);
        pdu.writeUInt16BE(modbusReq.readUInt16BE(4), 4);
        socket.write(buildMockSolarmanResponse(sn, seq, pdu));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const client = new SolarmanV5Client({
      host: '127.0.0.1',
      port,
      loggerSn: 2712345678,
      unitId: 1,
      timeout: 1000,
      retries: 0,
    });

    const regs = await client.readRegisters(587, 3, 0x03);
    assert.deepEqual(regs, [587, 588, 589]);

    const writeAck = await client.writeRegisters(142, [1]);
    assert.equal(writeAck.functionCode, 0x10);
    assert.equal(writeAck.startAddress, 142);
    assert.equal(writeAck.quantity, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('SolarmanV5Client rejects with TCP timeout after retries when dongle is silent', async () => {
  let connectionCount = 0;
  const silentSockets = [];
  const silentServer = net.createServer((socket) => {
    connectionCount++;
    silentSockets.push(socket);
  });

  await new Promise((resolve) => silentServer.listen(0, '127.0.0.1', resolve));
  const { port } = silentServer.address();

  try {
    const client = new SolarmanV5Client({
      host: '127.0.0.1',
      port,
      loggerSn: 2712345678,
      unitId: 1,
      timeout: 80,
      retries: 1,
    });

    await assert.rejects(() => client.readRegisters(588, 1, 0x03), /TCP timeout after 80ms/);
    assert.equal(connectionCount, 2);
  } finally {
    for (const s of silentSockets) s.destroy();
    await new Promise((resolve) => silentServer.close(resolve));
  }
});

test('deye-solarman-read routes failed reads to port 2 and emits stats to port 3', async () => {
  const failingClient = {
    async readRegisters() {
      throw new Error('TCP timeout after 3000ms');
    },
  };
  const { registered } = createMockRedHarness(failingClient);
  const ReadNode = registered.get('deye-solarman-read');
  const node = new ReadNode({
    id: 'read-err-1',
    type: 'deye-solarman-read',
    name: 'Test Read Error',
    dongle: 'cfg-1',
    paceMs: 0,
    blockDelayMs: 0,
    blocks: [{ startAddress: 587, registerCount: 2, functionCode: 3 }],
    registers: [],
  });

  const res = await invokeReadNode(node, { topic: 'test/fail', payload: 1 });
  assert.equal(res.err, undefined);
  assert.equal(res.outputs.length, 3);
  assert.equal(res.outputs[0], null);
  assert.equal(res.outputs[1].topic, 'test/fail');
  assert.equal(res.outputs[1].payload.ok, false);
  assert.match(res.outputs[1].payload.error, /TCP timeout after 3000ms/);
  assert.match(res.outputs[1].error.message, /TCP timeout after 3000ms/);
  assert.equal(res.outputs[2].payload.status, 'error');
  assert.equal(res.outputs[2].payload.totals.failed, 1);
  assert.equal(res.outputs[2].payload.queue.mode, 'fifo');
  assert.equal(res.outputs[2].payload.queue.maxQueue, 10);
});

test('deye-solarman-read defaults to FIFO (maxQueue 10), enforces job pacing & block delay, and reports stats', async () => {
  const callTimestamps = [];
  const client = {
    async readRegisters(startAddress) {
      callTimestamps.push({ startAddress, at: Date.now() });
      return [startAddress];
    },
  };

  const { registered } = createMockRedHarness(client);
  const ReadNode = registered.get('deye-solarman-read');
  const node = new ReadNode({
    id: 'read-pace-1',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    paceMs: 60,
    blockDelayMs: 25,
    blocks: [
      { startAddress: 500, registerCount: 1, functionCode: 3 },
      { startAddress: 600, registerCount: 1, functionCode: 3 },
    ],
    registers: [],
  });

  const runs = await Promise.all([
    invokeReadNode(node, { tag: 'job1', payload: 1 }),
    invokeReadNode(node, { tag: 'job2', payload: 2 }),
  ]);

  assert.equal(runs[0].outputs[0].tag, 'job1');
  assert.equal(runs[1].outputs[0].tag, 'job2');

  // Verify block ordering + inter-block delay (>= 20ms) + inter-job pacing (>= 50ms)
  assert.deepEqual(
    callTimestamps.map((c) => c.startAddress),
    [500, 600, 500, 600]
  );
  assert.ok(callTimestamps[1].at - callTimestamps[0].at >= 15);
  assert.ok(callTimestamps[2].at - callTimestamps[1].at >= 45);

  const stats = runs[1].outputs[2].payload;
  assert.equal(stats.status, 'ok');
  assert.equal(stats.queue.mode, 'fifo');
  assert.equal(stats.queue.maxQueue, 10);
  assert.equal(stats.totals.completed, 2);
  assert.equal(stats.totals.blocksRead, 4);
  assert.ok(stats.pacing.pacingWaitMs >= 40);
  assert.ok(stats.rates.jobsPerMin > 0);
  assert.ok(stats.rates.blocksPerMin > 0);
  assert.equal(stats.rates.successRatePct, 100);
});

test('deye-solarman-read default FIFO maxQueue 10 routes 12th concurrent trigger to port 2', async () => {
  const slowClient = {
    async readRegisters(startAddress) {
      await new Promise((r) => setTimeout(r, 15));
      return [startAddress];
    },
  };

  const { registered } = createMockRedHarness(slowClient);
  const ReadNode = registered.get('deye-solarman-read');
  const node = new ReadNode({
    id: 'read-fifo-default',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    paceMs: 0,
    blockDelayMs: 0,
    blocks: [{ startAddress: 500, registerCount: 1, functionCode: 3 }],
    registers: [],
  });

  // 1 active + 10 queued = 11 succeed; 12th overflows to output 2
  const runs = await Promise.all(
    Array.from({ length: 12 }, (_, idx) => invokeReadNode(node, { idx, payload: idx }))
  );

  for (let i = 0; i < 11; i++) {
    assert.equal(runs[i].outputs[0].idx, i);
    assert.equal(runs[i].outputs[1], null);
  }
  assert.equal(runs[11].outputs[0], null);
  assert.match(runs[11].outputs[1].payload.error, /queue full \(max 10 pending\)/i);
  assert.equal(runs[11].outputs[2].payload.status, 'queue_full');
});

test('deye-solarman-read latest and drop policies still work and emit stats on port 3', async () => {
  let activeCalls = 0;
  const slowClient = {
    async readRegisters(startAddress) {
      activeCalls++;
      await new Promise((r) => setTimeout(r, 30));
      return [startAddress];
    },
  };

  const { registered } = createMockRedHarness(slowClient);
  const ReadNode = registered.get('deye-solarman-read');

  const dropNode = new ReadNode({
    id: 'read-drop-1',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    queueMode: 'drop',
    paceMs: 0,
    blockDelayMs: 0,
    blocks: [{ startAddress: 500, registerCount: 1, functionCode: 3 }],
    registers: [],
  });

  const dropRuns = await Promise.all([
    invokeReadNode(dropNode, { tag: 'a', payload: 1 }),
    invokeReadNode(dropNode, { tag: 'b', payload: 2 }),
  ]);
  assert.equal(activeCalls, 1);
  assert.equal(dropRuns[0].outputs[0].tag, 'a');
  assert.equal(dropRuns[1].outputs[0], null);
  assert.equal(dropRuns[1].outputs[1], null);
  assert.equal(dropRuns[1].outputs[2].payload.status, 'dropped');
  assert.equal(dropRuns[1].outputs[2].payload.totals.dropped, 1);

  activeCalls = 0;
  const latestNode = new ReadNode({
    id: 'read-latest-1',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    queueMode: 'latest',
    paceMs: 0,
    blockDelayMs: 0,
    blocks: [{ startAddress: 500, registerCount: 1, functionCode: 3 }],
    registers: [],
  });

  const latestRuns = await Promise.all([
    invokeReadNode(latestNode, { tag: 'first', payload: 1 }),
    invokeReadNode(latestNode, { tag: 'superseded', payload: 2 }),
    invokeReadNode(latestNode, { tag: 'latest', payload: 3 }),
  ]);
  assert.equal(activeCalls, 2);
  assert.equal(latestRuns[0].outputs[0].tag, 'first');
  assert.equal(latestRuns[1].outputs[2].payload.status, 'coalesced');
  assert.equal(latestRuns[2].outputs[0].tag, 'latest');
});

test('deye-solarman-config preserves series and retries settings', () => {
  const { registered } = createMockRedHarness(null);
  const ConfigNode = registered.get('deye-solarman-config');
  const cfg = new ConfigNode({
    id: 'cfg-series',
    name: 'HV Dongle',
    host: '192.168.1.50',
    port: 8899,
    loggerSn: '2712345678',
    unitId: 1,
    timeout: 4000,
    retries: 0,
    series: 'SG01HP3',
  });
  assert.equal(cfg.series, 'SG01HP3');
  assert.equal(cfg.retries, 0);
  assert.equal(cfg.client.retries, 0);
});

test('resolvePreset builds series-aware blocks and registers for bms, rtc, and smoke', () => {
  const hpBms = resolvePreset('bms', 'SG01HP3');
  const lpBms = resolvePreset('bms', 'SG01LP1');

  const hpVolt = hpBms.registers.find((r) => r.key === 'bms_charge_voltage_limit');
  const lpVolt = lpBms.registers.find((r) => r.key === 'bms_charge_voltage_limit');
  assert.equal(hpVolt.scale, 0.1);
  assert.equal(lpVolt.scale, 0.01);
  assert.ok(hpBms.registers.some((r) => r.key === 'bms_alarm_flags'));
  assert.ok(hpBms.registers.some((r) => r.key === 'bms_soh'));

  const hpRtc = resolvePreset('rtc', 'SG01HP3');
  const lpRtc = resolvePreset('rtc', 'SG01LP1');
  assert.equal(hpRtc.blocks[0].startAddress, 62);
  assert.equal(lpRtc.blocks[0].startAddress, 22);

  const hpTemp = hpBms.registers.find((r) => r.key === 'battery_temp');
  const lpTemp = lpBms.registers.find((r) => r.key === 'battery_temp');
  assert.equal(hpTemp.address, 586);
  assert.equal(lpTemp.address, 182);

  const gridLoad = resolvePreset('grid_load', 'SG01HP3');
  const regMap = new Map(gridLoad.registers.map((r) => [r.key, r.address]));
  assert.equal(regMap.get('ups_backup_power'), 643);
  assert.equal(regMap.get('load_l1_voltage'), 644);
  assert.equal(regMap.get('load_l2_voltage'), 645);
  assert.equal(regMap.get('load_l3_voltage'), 646);
  assert.equal(regMap.get('load_l1_power'), 650);
  assert.equal(regMap.get('load_l2_power'), 651);
  assert.equal(regMap.get('load_l3_power'), 652);
  assert.equal(regMap.get('load_total_power'), 653);

  const lpLoad = resolvePreset('grid_load', 'SG01LP1');
  const lpLoadVolt = lpLoad.registers.find((r) => r.key === 'load_l1_voltage');
  assert.equal(lpLoadVolt.address, 157);
});

test('deye-solarman-read message mode accepts msg.payload presets and raw requests, rejects timestamps', async () => {
  const fakeRegisters = new Map([
    [212, 0x0000], // bms_alarm_flags
    [214, 45],     // bms_charge_current_limit
    [215, 50],     // bms_discharge_current_limit
    [219, 99],     // bms_soh
    [220, 5184],   // bms_charge_voltage_limit (518.4V on SG01HP3)
    [221, 4032],   // bms_discharge_voltage_limit (403.2V on SG01HP3)
    [586, 1264],   // battery_temp (26.4C at 0x024A)
    [587, 4608],   // battery_voltage (460.8V)
    [588, 84],     // battery_soc
    [590, 65336],  // battery_power (-200W)
    [591, 65486],  // battery_current (-5.0A)
  ]);

  const client = {
    async readRegisters(startAddress, count) {
      return Array.from({ length: count }, (_, idx) => fakeRegisters.get(startAddress + idx) ?? 0);
    },
  };

  const { registered } = createMockRedHarness(client, 'SG01HP3');
  const ReadNode = registered.get('deye-solarman-read');
  const node = new ReadNode({
    id: 'read-msg-mode',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    requestMode: 'message',
    paceMs: 0,
    blockDelayMs: 0,
  });

  // 1. Plain timestamp inject must fail cleanly to Output 2 in strict message mode
  const badRes = await invokeReadNode(node, { topic: 'bad', payload: Date.now() });
  assert.equal(badRes.outputs[0], null);
  assert.match(badRes.outputs[1].payload.error, /No read request found in msg/i);

  // 2. String preset in msg.payload produces full decoded bms_* JSON + register-number raw values
  const bmsRes = await invokeReadNode(node, { topic: 'deye/bms', payload: 'bms' });
  assert.equal(bmsRes.outputs[1], null);
  assert.equal(bmsRes.outputs[0].payload.bms_alarm_flags, 0);
  assert.equal(bmsRes.outputs[0].payload.bms_charge_current_limit, 45);
  assert.equal(bmsRes.outputs[0].payload.bms_soh, 99);
  assert.equal(bmsRes.outputs[0].payload.bms_charge_voltage_limit, 518.4);
  assert.equal(bmsRes.outputs[0].payload.battery_temp, 26.4);
  assert.equal(bmsRes.outputs[0].payload.raw[586], 1264);
  assert.equal(bmsRes.outputs[0].payload.raw[220], 5184);
  assert.equal(bmsRes.outputs[0].payload.raw[590], 65336);
  assert.equal(bmsRes.outputs[0].solarman.preset, 'bms');

  // 3. Raw startAddress/registerCount in msg.payload returns raw words
  const rawRes = await invokeReadNode(node, {
    topic: 'deye/raw',
    payload: { startAddress: 219, registerCount: 3 },
  });
  assert.deepEqual(rawRes.outputs[0].payload, [{ startAddress: 219, words: [99, 5184, 4032] }]);
});

test('deye-solarman-read preset mode runs configured preset and respects allowMsgOverride', async () => {
  const client = {
    async readRegisters(startAddress, count) {
      if (startAddress === 62) return [0x1a0b, 0x1011, 0x1e00];
      return Array.from({ length: count }, (_, idx) => startAddress + idx);
    },
  };

  const { registered } = createMockRedHarness(client, 'SG01HP3');
  const ReadNode = registered.get('deye-solarman-read');

  const overrideNode = new ReadNode({
    id: 'read-preset-override',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    requestMode: 'preset',
    preset: 'smoke',
    allowMsgOverride: true,
    paceMs: 0,
    blockDelayMs: 0,
  });

  // Bare timestamp triggers configured 'smoke' preset and includes register-number raw values
  const smokeRes = await invokeReadNode(overrideNode, { payload: Date.now() });
  assert.ok('battery_soc' in smokeRes.outputs[0].payload);
  assert.equal(smokeRes.outputs[0].payload.raw[588], 588);
  assert.equal(smokeRes.outputs[0].solarman.preset, 'smoke');

  // msg.payload = 'rtc' overrides 'smoke' preset and returns inverterTime + raw
  const rtcRes = await invokeReadNode(overrideNode, { payload: 'rtc' });
  assert.deepEqual(rtcRes.outputs[0].payload.rtc_year_month, { high: 26, low: 11 });
  assert.equal(rtcRes.outputs[0].payload.inverterTime, '2026-11-16 17:30:00');
  assert.equal(rtcRes.outputs[0].payload.raw[62], 0x1a0b);
  assert.equal(rtcRes.outputs[0].solarman.preset, 'rtc');

  // msg.payload = 'full' also includes inverterTime and raw for all registers
  const fullRes = await invokeReadNode(overrideNode, { payload: 'full' });
  assert.equal(fullRes.outputs[0].payload.inverterTime, '2026-11-16 17:30:00');
  assert.equal(fullRes.outputs[0].payload.raw[63], 0x1011);
  assert.equal(fullRes.outputs[0].payload.raw[219], 219);
  assert.equal(fullRes.outputs[0].solarman.preset, 'full');

  // When allowMsgOverride is false, msg.payload = 'rtc' is ignored and 'smoke' runs
  const strictNode = new ReadNode({
    id: 'read-preset-strict',
    type: 'deye-solarman-read',
    dongle: 'cfg-1',
    requestMode: 'preset',
    preset: 'smoke',
    allowMsgOverride: false,
    paceMs: 0,
    blockDelayMs: 0,
  });
  const strictRes = await invokeReadNode(strictNode, { payload: 'rtc' });
  assert.ok('battery_soc' in strictRes.outputs[0].payload);
  assert.equal(strictRes.outputs[0].solarman.preset, 'smoke');
});

test('resolvePreset supports full_telemetry_bms_pv and Full Telemetry+BMS+PV alias without grid registers', () => {
  const res = resolvePreset('full_telemetry_bms_pv', 'SG01HP3');
  const keys = new Set(res.registers.map((r) => r.key));
  assert.equal(res.label, 'Full Telemetry+BMS+PV');
  assert.ok(keys.has('rtc_year_month'));
  assert.ok(keys.has('bms_soh'));
  assert.ok(keys.has('bms_charge_voltage_limit'));
  assert.ok(keys.has('pv1_power'));
  assert.ok(keys.has('pv2_voltage'));
  assert.ok(keys.has('load_l1_voltage'));
  assert.ok(keys.has('load_l2_voltage'));
  assert.ok(keys.has('load_l3_voltage'));
  assert.ok(keys.has('load_total_power'));
  assert.ok(!keys.has('grid_l1_voltage'));
  assert.ok(!keys.has('grid_frequency'));
  assert.ok(!keys.has('grid_ct_total_power'));
  assert.ok(!keys.has('daily_grid_bought'));
  assert.ok(!keys.has('daily_grid_sold'));
  assert.ok(!keys.has('gen_total_power'));
  assert.ok(!keys.has('device_type'));

  const aliasRes = resolvePreset('Full Telemetry+BMS+PV', 'SG01HP3');
  assert.equal(aliasRes.preset, 'full_telemetry_bms_pv');
  assert.equal(aliasRes.registers.length, res.registers.length);
});

test('resolveRtcSync builds series-aware RTC words and deye-solarman-write syncs RTC simply', async () => {
  const hpSync = resolveRtcSync('SG01HP3', '2026-11-16 18:55:12');
  assert.equal(hpSync.address, 0x003e);
  assert.deepEqual(hpSync.words, encodeRtcWords(new Date('2026-11-16T18:55:12')));
  assert.equal(hpSync.syncedTime, '2026-11-16 18:55:12');

  const lpSync = resolveRtcSync('SG01LP1', '2026-11-16T18:55:12');
  assert.equal(lpSync.address, 0x0016);
  assert.throws(() => resolveRtcSync('M80G3'), /does not support inverter RTC/i);

  const writes = [];
  const client = {
    async writeRegisters(startAddress, values) {
      writes.push({ startAddress, values });
      return { functionCode: 0x10, startAddress, quantity: values.length };
    },
  };

  const { registered } = createMockRedHarness(client, 'SG01HP3');
  const WriteNode = registered.get('deye-solarman-write');

  // 1. Dedicated sync_rtc writeMode node triggered by plain timestamp or custom date
  const rtcSyncNode = new WriteNode({
    id: 'write-rtc-sync',
    type: 'deye-solarman-write',
    dongle: 'cfg-1',
    writeMode: 'sync_rtc',
  });

  const tsMs = new Date(2026, 10, 16, 18, 55, 12).getTime();
  const syncRes = await invokeReadNode(rtcSyncNode, { topic: 'rtc/sync', payload: tsMs });
  assert.equal(syncRes.err, undefined);
  assert.equal(syncRes.outputs.length, 2);
  assert.equal(syncRes.outputs[1], null);
  assert.equal(syncRes.outputs[0].payload.ok, true);
  assert.equal(syncRes.outputs[0].payload.action, 'sync_rtc');
  assert.equal(syncRes.outputs[0].payload.address, 62);
  assert.equal(syncRes.outputs[0].payload.syncedTime, '2026-11-16 18:55:12');
  assert.deepEqual(writes[0], {
    startAddress: 62,
    values: encodeRtcWords(new Date(tsMs)),
  });

  // 2. Standard register mode still writes explicit registers and also supports msg.payload = 'sync_rtc'
  const regNode = new WriteNode({
    id: 'write-reg-default',
    type: 'deye-solarman-write',
    dongle: 'cfg-1',
    writeMode: 'register',
    address: 142,
  });

  const regRes = await invokeReadNode(regNode, { payload: 1 });
  assert.equal(regRes.err, undefined);
  assert.equal(regRes.outputs[1], null);
  assert.equal(regRes.outputs[0].payload.address, 142);
  assert.deepEqual(writes[1], { startAddress: 142, values: [1] });

  const msgSyncRes = await invokeReadNode(regNode, {
    payload: { action: 'sync_rtc', date: '2026-11-16 19:00:00' },
  });
  assert.equal(msgSyncRes.err, undefined);
  assert.equal(msgSyncRes.outputs[1], null);
  assert.equal(msgSyncRes.outputs[0].payload.action, 'sync_rtc');
  assert.equal(msgSyncRes.outputs[0].payload.syncedTime, '2026-11-16 19:00:00');
  assert.equal(writes[2].startAddress, 62);

  // 3. Invalid inputs and client write failures route cleanly to Port 2 (error)
  const invalidRes = await invokeReadNode(regNode, { topic: 'write/bad', payload: 'not-a-number' });
  assert.equal(invalidRes.err, undefined);
  assert.equal(invalidRes.outputs[0], null);
  assert.equal(invalidRes.outputs[1].payload.ok, false);
  assert.match(invalidRes.outputs[1].payload.error, /Invalid register address or payload value/i);
  assert.match(invalidRes.outputs[1].error.message, /Invalid register address or payload value/i);

  const failingClient = {
    async writeRegisters() {
      throw new Error('Modbus exception 0x2 on FC 0x10');
    },
  };
  const { registered: errReg } = createMockRedHarness(failingClient, 'SG01HP3');
  const ErrWriteNode = errReg.get('deye-solarman-write');
  const errWriteNode = new ErrWriteNode({
    id: 'write-fail-1',
    type: 'deye-solarman-write',
    dongle: 'cfg-1',
    writeMode: 'register',
    address: 142,
  });
  const failRes = await invokeReadNode(errWriteNode, { topic: 'write/fail', payload: 2 });
  assert.equal(failRes.err, undefined);
  assert.equal(failRes.outputs[0], null);
  assert.equal(failRes.outputs[1].payload.ok, false);
  assert.equal(failRes.outputs[1].payload.address, 142);
  assert.match(failRes.outputs[1].payload.error, /Modbus exception 0x2/i);

  // 4. Unsupported series for RTC sync routes error to Port 2
  const { registered: m80Reg } = createMockRedHarness(client, 'M80G3');
  const M80WriteNode = m80Reg.get('deye-solarman-write');
  const m80SyncNode = new M80WriteNode({
    id: 'write-m80-rtc',
    type: 'deye-solarman-write',
    dongle: 'cfg-1',
    writeMode: 'sync_rtc',
  });
  const m80Res = await invokeReadNode(m80SyncNode, { payload: Date.now() });
  assert.equal(m80Res.outputs[0], null);
  assert.equal(m80Res.outputs[1].payload.ok, false);
  assert.match(m80Res.outputs[1].payload.error, /does not support inverter RTC/i);
});


