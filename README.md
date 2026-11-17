# node-red-contrib-deye-solarman-dongle-v5

Zero-dependency Node-RED nodes for communicating locally with **Deye Hybrid & Micro Inverters** and **BOS-G BMS** over the **Solarman V5** TCP protocol (port `8899`) via LSW-3 / LSE-3 Wi-Fi & Ethernet data loggers.

## Features

- **Zero External Dependencies** — Pure Node.js `net.Socket` Solarman V5 (`0xA5 ... 0x15`) framing and CRC-16/MODBUS engine.
- **Built-in Series-Aware Register Presets (`lib/registers.js`)** — Includes `smoke`, `rtc` (`0x003E–0x0040` on 3-phase `SG04LP3`/`SG01HP3`, `0x0016–0x0018` on 1-phase `SG01LP1`), `bms` (`bms_*` with HV `0.1 V` vs LV `0.01 V` scaling), `bms_gen`, `grid_load`, `pv`, `full_telemetry_bms_pv` (**Full Telemetry+BMS+PV**), and `full`.
- **Flexible Request Sources on `deye-solarman-read`** — Choose **Accept from incoming `msg`**, **Built-in Preset** (with optional `msg` override), or **Custom Blocks & Registers JSON** right in the Node-RED editor.
- **Dongle Pacing & Bounded FIFO Queueing** — Defaults to `fifo` (`maxQueue: 10`), `250 ms` inter-job cooldown pacing, and `50 ms` inter-block delay.
- **3 Dedicated Outputs on `deye-solarman-read`**:
  1. **Output 1 (`success`)** — Decoded telemetry object (with `msg.payload.raw` keyed by Modbus register number and `msg.payload.inverterTime` when RTC registers are read).
  2. **Output 2 (`error`)** — Failed reads, timeouts, or FIFO overflow errors (`msg.error.message` and `msg.payload.error`).
  3. **Output 3 (`stats`)** — Live dongle consumption metrics (`rates.jobsPerMin`, `rates.blocksPerMin`, `rates.utilizationPct`, `queue`, `pacing`, `totals`).
- **Safe FC `0x10` Writes & 1-Click RTC Sync (`deye-solarman-write`)** — Uses Preset Multiple Registers (`0x10`), includes a built-in **Sync Inverter Clock (RTC)** mode, and routes failures to Output 2 (`error`).

## Installation

### Option 1: Install directly into Node-RED (`~/.node-red`)
```bash
cd ~/.node-red
npm install --no-audit --no-fund /path/to/node-red-contrib-deye-solarman-dongle-V5
```

### Option 2: Install from your Git repository
```bash
cd ~/.node-red
npm install --no-audit --no-fund git+https://github.com/<your-user>/node-red-contrib-deye-solarman-dongle-V5.git
```

Restart Node-RED and hard-refresh the browser UI. Import the included test suite via **Menu → Import → Examples → node-red-contrib-deye-solarman-dongle-v5 → deye-test-flow**.

## Message-Driven Read Examples

When `Request Source` is set to **Accept from incoming `msg`** (or when **Msg Override** is enabled in Preset/Custom mode), you can send any of the following into `deye-solarman-read`:

1. **Trigger a Built-in Preset via `msg.payload` or `msg.preset`**:
   ```json
   { "topic": "deye/bms", "payload": "bms" }
   ```
   Valid preset names: `smoke`, `rtc`, `bms`, `bms_gen`, `grid_load`, `pv`, `full_telemetry_bms_pv`, `full`.

2. **Quick Single-Block Raw Read**:
   ```json
   {
     "topic": "bms/raw",
     "payload": { "startAddress": 212, "registerCount": 7, "functionCode": 3 }
   }
   ```

3. **Custom Blocks + Registers Map**:
   ```json
   {
     "topic": "deye/custom",
     "blocks": [{ "startAddress": 212, "registerCount": 10, "functionCode": 3 }],
     "registers": [
       { "key": "bms_alarm_flags", "address": 212, "wordCount": 1, "dataType": "uint16", "scale": 1, "offset": 0 },
       { "key": "bms_soh", "address": 219, "wordCount": 1, "dataType": "uint16", "scale": 1, "offset": 0, "unit": "%" },
       { "key": "bms_charge_voltage_limit", "address": 220, "wordCount": 1, "dataType": "uint16", "scale": 0.1, "offset": 0, "unit": "V" }
     ]
   }
   ```

## Syncing Inverter Clock (RTC) with `deye-solarman-write`

- **Editor Mode**: Set **Mode** to **Sync Inverter Clock (RTC)** and wire any `inject` node (e.g., manual click or repeat hourly). It automatically packs and writes the 3 RTC registers via FC `0x10` (`0x003E` for 3-phase `SG04LP3`/`SG01HP3`, `0x0016` for 1-phase `SG01LP1`).
- **Message Trigger (in default Register mode)**: Send `msg.payload = "sync_rtc"` (or `{ "action": "sync_rtc", "date": "2026-11-16 18:55:00" }`).

## Running Tests

```bash
npm test
```

