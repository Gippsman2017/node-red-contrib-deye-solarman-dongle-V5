'use strict';

/**
 * Series-aware Deye + BOS-G register catalog used by built-in presets.
 * Matches the register definitions in the Deye Solarman V5 workbench.
 */
const CATALOG_REGISTERS = [
  // Inverter & Status / RTC
  {
    key: 'device_type',
    address: 0x0000,
    wordCount: 1,
    dataType: 'enum',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'rtc_year_month',
    address: 0x0016,
    wordCount: 1,
    dataType: 'packed_bytes',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG04LP3: { address: 0x003e },
      SG01HP3: { address: 0x003e },
    },
  },
  {
    key: 'rtc_day_hour',
    address: 0x0017,
    wordCount: 1,
    dataType: 'packed_bytes',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG04LP3: { address: 0x003f },
      SG01HP3: { address: 0x003f },
    },
  },
  {
    key: 'rtc_minute_second',
    address: 0x0018,
    wordCount: 1,
    dataType: 'packed_bytes',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG04LP3: { address: 0x0040 },
      SG01HP3: { address: 0x0040 },
    },
  },
  {
    key: 'run_state',
    address: 0x01f4,
    wordCount: 1,
    dataType: 'enum',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'dc_transformer_temp',
    address: 0x021c,
    wordCount: 1,
    dataType: 'int16',
    scale: 0.1,
    offset: -100,
    unit: '°C',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'radiator_temp',
    address: 0x021d,
    wordCount: 1,
    dataType: 'int16',
    scale: 0.1,
    offset: -100,
    unit: '°C',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },

  // PV Solar
  {
    key: 'daily_pv_production',
    address: 0x0211,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'total_pv_production',
    address: 0x0216,
    wordCount: 2,
    dataType: 'uint32_le_words',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv1_power',
    address: 0x02a0,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv2_power',
    address: 0x02a1,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv1_voltage',
    address: 0x02a4,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv1_current',
    address: 0x02a5,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'A',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv2_voltage',
    address: 0x02a6,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'pv2_current',
    address: 0x02a7,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'A',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },

  // Battery & BOS-G BMS
  {
    key: 'daily_battery_charge',
    address: 0x0202,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'daily_battery_discharge',
    address: 0x0203,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'battery_temp',
    address: 0x024a,
    wordCount: 1,
    dataType: 'int16',
    scale: 0.1,
    offset: -100,
    unit: '°C',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01LP1: { address: 0x00b6 },
    },
  },
  {
    key: 'battery_voltage',
    address: 0x024b,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.01,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01HP3: { scale: 0.1 },
    },
  },
  {
    key: 'battery_soc',
    address: 0x024c,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: '%',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'battery_power',
    address: 0x024e,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'battery_current',
    address: 0x024f,
    wordCount: 1,
    dataType: 'int16',
    scale: 0.01,
    offset: 0,
    unit: 'A',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01HP3: { scale: 0.1 },
    },
  },
  {
    key: 'bms_alarm_flags',
    address: 0x00d4,
    wordCount: 1,
    dataType: 'bitmask',
    scale: 1,
    offset: 0,
    unit: '',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'bms_charge_current_limit',
    address: 0x00d6,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: 'A',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'bms_discharge_current_limit',
    address: 0x00d7,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: 'A',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'bms_soh',
    address: 0x00db,
    wordCount: 1,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    unit: '%',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'bms_charge_voltage_limit',
    address: 0x00dc,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.01,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01HP3: { scale: 0.1 },
    },
  },
  {
    key: 'bms_discharge_voltage_limit',
    address: 0x00dd,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.01,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01HP3: { scale: 0.1 },
    },
  },

  // Grid & CT
  {
    key: 'daily_grid_bought',
    address: 0x0208,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'daily_grid_sold',
    address: 0x0209,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'grid_l1_voltage',
    address: 0x0256,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'grid_l2_voltage',
    address: 0x0257,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'grid_l3_voltage',
    address: 0x0258,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'grid_frequency',
    address: 0x0261,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.01,
    offset: 0,
    unit: 'Hz',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },
  {
    key: 'grid_ct_total_power',
    address: 0x026b,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'inverter_total_power',
    address: 0x0271,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3', 'M80G3'],
  },

  // Load & Backup
  {
    key: 'daily_load_consumption',
    address: 0x020e,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'kWh',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'ups_backup_power',
    address: 0x0283,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'load_l1_voltage',
    address: 0x0284,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
    seriesOverrides: {
      SG01LP1: { address: 0x009d },
    },
  },
  {
    key: 'load_l2_voltage',
    address: 0x0285,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'load_l3_voltage',
    address: 0x0286,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'load_l1_power',
    address: 0x028a,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'load_l2_power',
    address: 0x028b,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'load_l3_power',
    address: 0x028c,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01HP3'],
  },
  {
    key: 'load_total_power',
    address: 0x028d,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },

  // Generator & Aux
  {
    key: 'gen_l1_voltage',
    address: 0x0295,
    wordCount: 1,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    unit: 'V',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
  {
    key: 'gen_total_power',
    address: 0x029b,
    wordCount: 1,
    dataType: 'int16',
    scale: 1,
    offset: 0,
    unit: 'W',
    series: ['SG04LP3', 'SG01LP1', 'SG01HP3'],
  },
];

const PRESET_DEFINITIONS = {
  smoke: {
    label: 'Core Telemetry (Smoke Test)',
    keys: [
      'run_state',
      'battery_voltage',
      'battery_soc',
      'battery_power',
      'grid_frequency',
      'load_total_power',
      'pv1_power',
      'pv2_power',
    ],
  },
  rtc: {
    label: 'Inverter Clock (RTC)',
    keys: ['rtc_year_month', 'rtc_day_hour', 'rtc_minute_second'],
  },
  bms: {
    label: 'BOS-G BMS & Battery',
    keys: [
      'battery_temp',
      'battery_voltage',
      'battery_soc',
      'battery_power',
      'battery_current',
      'bms_alarm_flags',
      'bms_charge_current_limit',
      'bms_discharge_current_limit',
      'bms_soh',
      'bms_charge_voltage_limit',
      'bms_discharge_voltage_limit',
    ],
  },
  bms_gen: {
    label: 'BOS-G BMS + Generator',
    keys: [
      'bms_alarm_flags',
      'bms_charge_current_limit',
      'bms_discharge_current_limit',
      'bms_soh',
      'bms_charge_voltage_limit',
      'bms_discharge_voltage_limit',
      'gen_l1_voltage',
      'gen_total_power',
    ],
  },
  grid_load: {
    label: 'Grid & Home Load Power',
    keys: [
      'grid_l1_voltage',
      'grid_l2_voltage',
      'grid_l3_voltage',
      'grid_frequency',
      'grid_ct_total_power',
      'inverter_total_power',
      'ups_backup_power',
      'load_l1_voltage',
      'load_l2_voltage',
      'load_l3_voltage',
      'load_total_power',
      'load_l1_power',
      'load_l2_power',
      'load_l3_power',
    ],
  },
  pv: {
    label: 'PV Solar Strings & Yield',
    keys: [
      'daily_pv_production',
      'total_pv_production',
      'pv1_power',
      'pv2_power',
      'pv1_voltage',
      'pv1_current',
      'pv2_voltage',
      'pv2_current',
    ],
  },
  full_telemetry_bms_pv: {
    label: 'Full Telemetry+BMS+PV',
    keys: [
      'rtc_year_month',
      'rtc_day_hour',
      'rtc_minute_second',
      'run_state',
      'dc_transformer_temp',
      'radiator_temp',
      'daily_pv_production',
      'total_pv_production',
      'pv1_power',
      'pv2_power',
      'pv1_voltage',
      'pv1_current',
      'pv2_voltage',
      'pv2_current',
      'daily_battery_charge',
      'daily_battery_discharge',
      'battery_temp',
      'battery_voltage',
      'battery_soc',
      'battery_power',
      'battery_current',
      'bms_alarm_flags',
      'bms_charge_current_limit',
      'bms_discharge_current_limit',
      'bms_soh',
      'bms_charge_voltage_limit',
      'bms_discharge_voltage_limit',
      'inverter_total_power',
      'daily_load_consumption',
      'ups_backup_power',
      'load_l1_voltage',
      'load_l2_voltage',
      'load_l3_voltage',
      'load_l1_power',
      'load_l2_power',
      'load_l3_power',
      'load_total_power',
    ],
  },
  full: {
    label: 'Full Telemetry + BMS + Grid + PV',
    keys: CATALOG_REGISTERS.map((r) => r.key),
  },
};

const PRESET_ALIASES = {
  'full telemetry+bms+pv': 'full_telemetry_bms_pv',
  full_bms_pv: 'full_telemetry_bms_pv',
  'full+bms+pv': 'full_telemetry_bms_pv',
};

function resolveRegisterForSeries(reg, series = 'SG04LP3') {
  const override = reg.seriesOverrides && reg.seriesOverrides[series];
  return {
    key: reg.key,
    address: override && override.address !== undefined ? override.address : reg.address,
    wordCount: reg.wordCount,
    dataType: reg.dataType,
    scale: override && override.scale !== undefined ? override.scale : reg.scale,
    offset: reg.offset || 0,
    unit: reg.unit || '',
  };
}

function buildPollBlocks(registers, maxGap = 8, maxBlockSize = 60) {
  if (!Array.isArray(registers) || registers.length === 0) return [];
  const sorted = [...registers].sort((a, b) => a.address - b.address);
  const blocks = [];
  let current = null;

  for (const reg of sorted) {
    const wordCount = Number(reg.wordCount) || 1;
    const fc = Number(reg.functionCode) || 3;
    const regEnd = reg.address + wordCount - 1;

    if (!current) {
      current = {
        startAddress: reg.address,
        endAddress: regEnd,
        registerCount: wordCount,
        functionCode: fc,
      };
      continue;
    }

    const gap = reg.address - current.endAddress - 1;
    const candidateEnd = Math.max(current.endAddress, regEnd);
    const candidateCount = candidateEnd - current.startAddress + 1;

    if (fc === current.functionCode && gap <= maxGap && candidateCount <= maxBlockSize) {
      current.endAddress = candidateEnd;
      current.registerCount = candidateCount;
    } else {
      blocks.push({
        startAddress: current.startAddress,
        registerCount: current.registerCount,
        functionCode: current.functionCode,
      });
      current = {
        startAddress: reg.address,
        endAddress: regEnd,
        registerCount: wordCount,
        functionCode: fc,
      };
    }
  }

  if (current) {
    blocks.push({
      startAddress: current.startAddress,
      registerCount: current.registerCount,
      functionCode: current.functionCode,
    });
  }
  return blocks;
}

function getPresetNames() {
  return Object.keys(PRESET_DEFINITIONS);
}

function resolvePreset(presetName, series = 'SG04LP3', options = {}) {
  const rawName = String(presetName || '').trim();
  const canonicalName = PRESET_DEFINITIONS[rawName]
    ? rawName
    : PRESET_ALIASES[rawName.toLowerCase()] || rawName;
  const def = PRESET_DEFINITIONS[canonicalName];
  if (!def) {
    throw new Error(
      `Unknown register preset "${presetName}". Valid presets: ${getPresetNames().join(', ')}`
    );
  }
  const activeSeries = series || 'SG04LP3';
  const keySet = new Set(def.keys);
  const registers = CATALOG_REGISTERS.filter(
    (r) => keySet.has(r.key) && (!r.series || r.series.includes(activeSeries))
  ).map((r) => resolveRegisterForSeries(r, activeSeries));

  const maxGap = options.maxGap !== undefined ? Number(options.maxGap) : 8;
  const maxBlockSize = options.maxBlockSize !== undefined ? Number(options.maxBlockSize) : 60;
  const blocks = buildPollBlocks(registers, maxGap, maxBlockSize);

  return {
    preset: canonicalName,
    label: def.label,
    series: activeSeries,
    blocks,
    registers,
  };
}

function extractRawValue(spec, words, baseAddress) {
  const idx = spec.address - baseAddress;
  if (idx < 0 || idx >= words.length) return null;

  const low = words[idx] & 0xffff;
  if (spec.dataType === 'uint32_le_words' || Number(spec.wordCount) === 2) {
    const high = idx + 1 < words.length ? words[idx + 1] & 0xffff : 0;
    return high * 65536 + low;
  }
  return low;
}

function formatInverterTime(decoded) {
  if (!decoded || typeof decoded !== 'object') return null;
  const ym = decoded.rtc_year_month;
  const dh = decoded.rtc_day_hour;
  const ms = decoded.rtc_minute_second;
  if (
    !ym ||
    !dh ||
    !ms ||
    typeof ym !== 'object' ||
    typeof dh !== 'object' ||
    typeof ms !== 'object'
  ) {
    return null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `20${pad(ym.high)}-${pad(ym.low)}-${pad(dh.high)} ${pad(dh.low)}:${pad(ms.high)}:${pad(ms.low)}`;
}

function decodeRegister(spec, words, baseAddress) {
  const idx = spec.address - baseAddress;
  if (idx < 0 || idx >= words.length) return null;

  const low = words[idx] & 0xffff;
  const high = idx + 1 < words.length ? words[idx + 1] & 0xffff : 0;

  if (spec.dataType === 'uint32_le_words') {
    const val = high * 65536 + low;
    return Number((val * spec.scale + (spec.offset || 0)).toFixed(2));
  }

  if (spec.dataType === 'hhmm') {
    const hh = String(Math.floor(low / 100)).padStart(2, '0');
    const mm = String(low % 100).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  if (spec.dataType === 'packed_bytes') {
    const hi = (low >> 8) & 0xff;
    const lo = low & 0xff;
    return { high: hi, low: lo };
  }

  let numeric = low;
  if (spec.dataType === 'int16' && low >= 0x8000) {
    numeric = low - 0x10000;
  }
  return Number((numeric * spec.scale + (spec.offset || 0)).toFixed(2));
}

function encodeRtcWords(date = new Date()) {
  const yy = date.getFullYear() - 2000;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const min = date.getMinutes();
  const sec = date.getSeconds();

  return [
    ((yy & 0xff) << 8) | (month & 0xff),
    ((day & 0xff) << 8) | (hour & 0xff),
    ((min & 0xff) << 8) | (sec & 0xff),
  ];
}

function parseSyncDate(dateInput) {
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) {
      throw new Error('Invalid Date object for RTC sync');
    }
    return dateInput;
  }
  if (typeof dateInput === 'number' && Number.isFinite(dateInput)) {
    const ms = dateInput < 1e11 ? dateInput * 1000 : dateInput;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2099) {
      throw new Error(`Invalid timestamp for RTC sync: ${dateInput}`);
    }
    return d;
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const lower = trimmed.toLowerCase();
    if (
      !trimmed ||
      lower === 'sync_rtc' ||
      lower === 'rtc_sync' ||
      lower === 'rtc' ||
      lower === 'now'
    ) {
      return new Date();
    }
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)
      ? trimmed.replace(' ', 'T')
      : trimmed;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2099) {
      throw new Error(`Invalid date string for RTC sync: "${dateInput}"`);
    }
    return d;
  }
  return new Date();
}

function formatDateYmdHms(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function resolveRtcSync(series = 'SG04LP3', dateInput) {
  const activeSeries = series || 'SG04LP3';
  if (activeSeries === 'M80G3') {
    throw new Error('Series M80G3 does not support inverter RTC register writes');
  }
  const address = activeSeries === 'SG01LP1' ? 0x0016 : 0x003e;
  const syncDate = parseSyncDate(dateInput);
  const words = encodeRtcWords(syncDate);
  return {
    series: activeSeries,
    address,
    words,
    syncedTime: formatDateYmdHms(syncDate),
  };
}

module.exports = {
  CATALOG_REGISTERS,
  PRESET_DEFINITIONS,
  getPresetNames,
  resolveRegisterForSeries,
  buildPollBlocks,
  resolvePreset,
  extractRawValue,
  formatInverterTime,
  decodeRegister,
  encodeRtcWords,
  resolveRtcSync,
};
