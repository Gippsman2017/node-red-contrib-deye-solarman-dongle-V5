'use strict';

const { resolveRtcSync } = require('../lib/registers');

module.exports = function (RED) {
  function DeyeSolarmanWriteNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const dongle = RED.nodes.getNode(config.dongle);
    const writeMode = config.writeMode === 'sync_rtc' ? 'sync_rtc' : 'register';

    let isRunning = false;
    let isClosed = false;
    const pendingQueue = [];

    if (!dongle || !dongle.client) {
      node.status({ fill: 'red', shape: 'ring', text: 'missing dongle config' });
    }

    function sendErrorToSecondOutput(job, err, extra = {}) {
      const { msg, send, done } = job;
      const errMessage = err && err.message ? err.message : String(err || 'Unknown write error');

      msg.error = {
        message: errMessage,
        source: {
          id: node.id,
          type: node.type,
          name: node.name || 'deye-solarman-write',
        },
      };
      msg.payload = {
        ok: false,
        error: errMessage,
        ...(extra.action ? { action: extra.action } : {}),
        ...(extra.address !== undefined && !Number.isNaN(extra.address)
          ? { address: extra.address }
          : {}),
        host: dongle ? dongle.host : null,
        port: dongle ? dongle.port : null,
        loggerSn: dongle ? dongle.loggerSn : null,
        timestamp: new Date().toISOString(),
      };

      node.status({ fill: 'red', shape: 'ring', text: errMessage });
      send([null, msg]);
      if (done) done();
    }

    function isMessageRtcSync(msg) {
      if (writeMode === 'sync_rtc') return true;
      const action = typeof msg.action === 'string' ? msg.action.trim().toLowerCase() : '';
      const preset = typeof msg.preset === 'string' ? msg.preset.trim().toLowerCase() : '';
      if (action === 'sync_rtc' || action === 'rtc_sync' || preset === 'sync_rtc') return true;

      if (typeof msg.payload === 'string') {
        const lower = msg.payload.trim().toLowerCase();
        if (lower === 'sync_rtc' || lower === 'rtc_sync') return true;
      }
      if (msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)) {
        const payloadAction =
          typeof msg.payload.action === 'string' ? msg.payload.action.trim().toLowerCase() : '';
        if (payloadAction === 'sync_rtc' || payloadAction === 'rtc_sync') return true;
      }
      return false;
    }

    function extractSyncDateInput(msg) {
      const payloadObj =
        msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
          ? msg.payload
          : null;
      if (msg.date !== undefined) return msg.date;
      if (payloadObj && payloadObj.date !== undefined) return payloadObj.date;
      if (msg.payload instanceof Date) return msg.payload;
      if (typeof msg.payload === 'number') {
        // Treat small numeric triggers (e.g. 0/1) as "now"; epoch timestamps >= 2000-01-01 as explicit time
        return msg.payload >= 946684800 ? msg.payload : undefined;
      }
      if (typeof msg.payload === 'string') return msg.payload;
      return undefined;
    }

    async function executeJob(job) {
      const { msg, send, done } = job;
      if (!dongle || !dongle.client) {
        sendErrorToSecondOutput(job, new Error('Missing dongle configuration'));
        return;
      }

      if (isMessageRtcSync(msg)) {
        const payloadObj =
          msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
            ? msg.payload
            : null;
        const activeSeries =
          (typeof msg.series === 'string' && msg.series.trim()) ||
          (payloadObj && typeof payloadObj.series === 'string' && payloadObj.series.trim()) ||
          (dongle && dongle.series) ||
          'SG04LP3';

        let rtcSync;
        try {
          rtcSync = resolveRtcSync(activeSeries, extractSyncDateInput(msg));
        } catch (syncErr) {
          sendErrorToSecondOutput(job, syncErr, { action: 'sync_rtc' });
          return;
        }

        node.status({
          fill: 'blue',
          shape: 'dot',
          text: `syncing RTC @0x${rtcSync.address.toString(16)}`,
        });
        try {
          const res = await dongle.client.writeRegisters(rtcSync.address, rtcSync.words);
          msg.payload = {
            ok: true,
            action: 'sync_rtc',
            series: rtcSync.series,
            address: rtcSync.address,
            values: rtcSync.words,
            syncedTime: rtcSync.syncedTime,
            response: res,
          };
          node.status({
            fill: 'green',
            shape: 'dot',
            text: `RTC synced (${rtcSync.syncedTime.slice(11)})`,
          });
          send([msg, null]);
          if (done) done();
        } catch (err) {
          sendErrorToSecondOutput(job, err, {
            action: 'sync_rtc',
            address: rtcSync.address,
          });
        }
        return;
      }

      const address = Number(msg.address !== undefined ? msg.address : config.address);
      const values = Array.isArray(msg.payload)
        ? msg.payload.map((v) => Number(v))
        : [Number(msg.payload)];

      if (Number.isNaN(address) || values.length === 0 || values.some(Number.isNaN)) {
        sendErrorToSecondOutput(job, new Error('Invalid register address or payload value'), {
          address,
        });
        return;
      }

      node.status({ fill: 'blue', shape: 'dot', text: `writing 0x${address.toString(16)}` });
      try {
        const res = await dongle.client.writeRegisters(address, values);
        msg.payload = { ok: true, address, values, response: res };
        node.status({ fill: 'green', shape: 'dot', text: `wrote @0x${address.toString(16)}` });
        send([msg, null]);
        if (done) done();
      } catch (err) {
        sendErrorToSecondOutput(job, err, { address });
      }
    }

    async function drainQueue() {
      if (isRunning || isClosed) return;
      isRunning = true;
      try {
        while (!isClosed && pendingQueue.length > 0) {
          const nextJob = pendingQueue.shift();
          await executeJob(nextJob);
        }
      } finally {
        isRunning = false;
      }
    }

    node.on('input', (msg, send, done) => {
      if (isClosed) {
        if (done) done();
        return;
      }
      if (pendingQueue.length >= 20) {
        sendErrorToSecondOutput(
          { msg, send, done },
          new Error('Write job queue full (max 20 pending)')
        );
        return;
      }
      pendingQueue.push({ msg, send, done });
      drainQueue();
    });

    node.on('close', (done) => {
      isClosed = true;
      while (pendingQueue.length > 0) {
        const canceled = pendingQueue.shift();
        if (canceled && canceled.done) canceled.done();
      }
      if (typeof done === 'function') done();
    });
  }

  RED.nodes.registerType('deye-solarman-write', DeyeSolarmanWriteNode);
};
