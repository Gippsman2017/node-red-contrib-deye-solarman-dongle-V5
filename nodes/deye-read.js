'use strict';

const {
  decodeRegister,
  formatInverterTime,
  resolvePreset,
} = require('../lib/registers');

function parseArrayConfig(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim().length > 0) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

module.exports = function (RED) {
  function DeyeSolarmanReadNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const dongle = RED.nodes.getNode(config.dongle);

    const defaultBlocks = parseArrayConfig(config.blocks);
    const defaultRegisters = parseArrayConfig(config.registers);
    const defaultPreset = config.preset || 'smoke';
    const allowMsgOverride = config.allowMsgOverride !== false;

    const requestMode = ['message', 'preset', 'custom'].includes(config.requestMode)
      ? config.requestMode
      : defaultBlocks.length > 0
        ? 'custom'
        : config.preset
          ? 'preset'
          : 'message';

    const parsedMaxGap = Number(config.maxGap);
    const maxGap =
      config.maxGap !== undefined && config.maxGap !== '' && !Number.isNaN(parsedMaxGap)
        ? Math.max(0, parsedMaxGap)
        : 8;

    const parsedMaxBlockSize = Number(config.maxBlockSize);
    const maxBlockSize =
      config.maxBlockSize !== undefined &&
      config.maxBlockSize !== '' &&
      !Number.isNaN(parsedMaxBlockSize)
        ? Math.max(1, parsedMaxBlockSize)
        : 60;

    const queueMode = ['fifo', 'latest', 'drop'].includes(config.queueMode)
      ? config.queueMode
      : 'fifo';

    const parsedMaxQueue = Number(config.maxQueue);
    const maxQueue =
      config.maxQueue !== undefined && config.maxQueue !== '' && !Number.isNaN(parsedMaxQueue)
        ? Math.max(1, parsedMaxQueue)
        : 10;

    const parsedPaceMs = Number(config.paceMs);
    const paceMs =
      config.paceMs !== undefined && config.paceMs !== '' && !Number.isNaN(parsedPaceMs)
        ? Math.max(0, parsedPaceMs)
        : 250;

    const parsedBlockDelayMs = Number(config.blockDelayMs);
    const blockDelayMs =
      config.blockDelayMs !== undefined &&
      config.blockDelayMs !== '' &&
      !Number.isNaN(parsedBlockDelayMs)
        ? Math.max(0, parsedBlockDelayMs)
        : 50;

    let isRunning = false;
    let isClosed = false;
    let lastJobEndTime = 0;
    const startedAt = Date.now();
    const pendingQueue = [];
    const activeTimers = new Set();
    const recentSamples = []; // { ts, durationMs, blocks, ok }

    const totals = {
      received: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      dropped: 0,
      coalesced: 0,
      blocksRead: 0,
      totalJobDurationMs: 0,
      minJobDurationMs: null,
      maxJobDurationMs: null,
    };

    if (!dongle || !dongle.client) {
      node.status({ fill: 'red', shape: 'ring', text: 'missing dongle config' });
    }

    function sleep(ms) {
      if (ms <= 0 || isClosed) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          activeTimers.delete(timer);
          resolve();
        }, ms);
        activeTimers.add(timer);
      });
    }

    function pruneWindow(now) {
      const cutoff = now - 60000;
      while (recentSamples.length > 0 && recentSamples[0].ts < cutoff) {
        recentSamples.shift();
      }
    }

    function buildStatsMessage(topic, eventStatus, lastJob, pacingWaitMs) {
      const now = Date.now();
      pruneWindow(now);

      const windowElapsedMs = Math.max(1000, Math.min(60000, now - startedAt));
      const windowMinutes = windowElapsedMs / 60000;
      const windowJobs = recentSamples.length;
      const windowBlocks = recentSamples.reduce((acc, s) => acc + s.blocks, 0);
      const windowBusyMs = recentSamples.reduce((acc, s) => acc + s.durationMs, 0);

      const avgJobDurationMs =
        totals.completed > 0
          ? Number((totals.totalJobDurationMs / totals.completed).toFixed(1))
          : 0;

      const successRatePct =
        totals.completed > 0
          ? Number(((totals.succeeded / totals.completed) * 100).toFixed(1))
          : 100;

      const utilizationPct = Number(
        Math.min(100, (windowBusyMs / windowElapsedMs) * 100).toFixed(1)
      );

      return {
        topic: topic ? `${topic}/stats` : 'deye/stats',
        payload: {
          timestamp: new Date(now).toISOString(),
          status: eventStatus,
          dongle: {
            host: dongle ? dongle.host : null,
            port: dongle ? dongle.port : null,
            loggerSn: dongle ? dongle.loggerSn : null,
            series: dongle ? dongle.series || 'SG04LP3' : null,
          },
          queue: {
            mode: queueMode,
            depth: pendingQueue.length,
            maxQueue,
            inFlight: isRunning,
          },
          pacing: {
            paceMs,
            blockDelayMs,
            pacingWaitMs,
          },
          lastJob,
          totals: {
            received: totals.received,
            completed: totals.completed,
            succeeded: totals.succeeded,
            failed: totals.failed,
            dropped: totals.dropped,
            coalesced: totals.coalesced,
            blocksRead: totals.blocksRead,
          },
          rates: {
            jobsPerMin: Number((windowJobs / windowMinutes).toFixed(2)),
            blocksPerMin: Number((windowBlocks / windowMinutes).toFixed(2)),
            avgJobDurationMs,
            minJobDurationMs: totals.minJobDurationMs ?? 0,
            maxJobDurationMs: totals.maxJobDurationMs ?? 0,
            successRatePct,
            utilizationPct,
          },
        },
      };
    }

    function recordCompletion(durationMs, blocksCount, ok) {
      const now = Date.now();
      totals.completed += 1;
      if (ok) totals.succeeded += 1;
      else totals.failed += 1;
      totals.blocksRead += blocksCount;
      totals.totalJobDurationMs += durationMs;
      totals.minJobDurationMs =
        totals.minJobDurationMs === null
          ? durationMs
          : Math.min(totals.minJobDurationMs, durationMs);
      totals.maxJobDurationMs =
        totals.maxJobDurationMs === null
          ? durationMs
          : Math.max(totals.maxJobDurationMs, durationMs);

      recentSamples.push({
        ts: now,
        durationMs,
        blocks: blocksCount,
        ok,
      });
      pruneWindow(now);
    }

    function sendErrorToSecondOutput(job, err, options = {}) {
      const { msg, send, done } = job;
      const {
        eventStatus = 'error',
        durationMs = 0,
        blocksCount = 0,
        pacingWaitMs = 0,
        countAsCompletion = true,
      } = options;

      const errMessage = err && err.message ? err.message : String(err || 'Unknown read error');

      if (countAsCompletion) {
        recordCompletion(durationMs, blocksCount, false);
      }

      const originalTopic = msg.topic;
      msg.error = {
        message: errMessage,
        source: {
          id: node.id,
          type: node.type,
          name: node.name || 'deye-solarman-read',
        },
      };
      msg.payload = {
        ok: false,
        error: errMessage,
        host: dongle ? dongle.host : null,
        port: dongle ? dongle.port : null,
        loggerSn: dongle ? dongle.loggerSn : null,
        timestamp: new Date().toISOString(),
      };

      const statsMsg = buildStatsMessage(
        originalTopic,
        eventStatus,
        countAsCompletion
          ? {
              ok: false,
              durationMs,
              blocksPolled: blocksCount,
              registersDecoded: 0,
              error: errMessage,
            }
          : null,
        pacingWaitMs
      );

      node.status({ fill: 'red', shape: 'ring', text: errMessage });
      send([null, msg, statsMsg]);
      if (done) done();
    }

    function extractMessageRequest(msg, activeSeries) {
      const payloadObj =
        msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
          ? msg.payload
          : null;

      const explicitRegisters = Array.isArray(msg.registers)
        ? msg.registers
        : payloadObj && Array.isArray(payloadObj.registers)
          ? payloadObj.registers
          : null;

      // 1. Explicit blocks array on msg.blocks or msg.payload.blocks
      if (Array.isArray(msg.blocks)) {
        return {
          blocks: msg.blocks,
          registers: explicitRegisters || [],
          presetUsed: null,
          seriesUsed: activeSeries,
        };
      }
      if (payloadObj && Array.isArray(payloadObj.blocks)) {
        return {
          blocks: payloadObj.blocks,
          registers: explicitRegisters || [],
          presetUsed: null,
          seriesUsed: activeSeries,
        };
      }

      // 2. Single-block shorthand on msg or msg.payload
      const topCount =
        msg.registerCount !== undefined ? msg.registerCount : msg.count;
      if (msg.startAddress !== undefined && topCount !== undefined) {
        return {
          blocks: [
            {
              startAddress: Number(msg.startAddress),
              registerCount: Number(topCount),
              functionCode: Number(msg.functionCode) || 0x03,
            },
          ],
          registers: explicitRegisters || [],
          presetUsed: null,
          seriesUsed: activeSeries,
        };
      }

      const payloadCount =
        payloadObj &&
        (payloadObj.registerCount !== undefined ? payloadObj.registerCount : payloadObj.count);
      if (payloadObj && payloadObj.startAddress !== undefined && payloadCount !== undefined) {
        return {
          blocks: [
            {
              startAddress: Number(payloadObj.startAddress),
              registerCount: Number(payloadCount),
              functionCode: Number(payloadObj.functionCode || msg.functionCode) || 0x03,
            },
          ],
          registers: explicitRegisters || [],
          presetUsed: null,
          seriesUsed: activeSeries,
        };
      }

      // 3. Built-in preset name via msg.preset, msg.payload.preset, or string msg.payload
      const presetCandidate =
        typeof msg.preset === 'string' && msg.preset.trim().length > 0
          ? msg.preset.trim()
          : payloadObj && typeof payloadObj.preset === 'string' && payloadObj.preset.trim().length > 0
            ? payloadObj.preset.trim()
            : typeof msg.payload === 'string' && msg.payload.trim().length > 0
              ? msg.payload.trim()
              : null;

      if (presetCandidate) {
        const resolved = resolvePreset(presetCandidate, activeSeries, {
          maxGap,
          maxBlockSize,
        });
        return {
          blocks: resolved.blocks,
          registers: explicitRegisters || resolved.registers,
          presetUsed: resolved.preset,
          seriesUsed: resolved.series,
        };
      }

      return null;
    }

    function resolveJobRequest(msg) {
      const payloadObj =
        msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
          ? msg.payload
          : null;
      const activeSeries =
        (typeof msg.series === 'string' && msg.series.trim()) ||
        (payloadObj && typeof payloadObj.series === 'string' && payloadObj.series.trim()) ||
        (dongle && dongle.series) ||
        'SG04LP3';

      const msgReq = extractMessageRequest(msg, activeSeries);

      if (requestMode === 'message') {
        if (!msgReq) {
          throw new Error(
            'No read request found in msg (provide msg.blocks, msg.startAddress + msg.registerCount, msg.preset, or msg.payload)'
          );
        }
        return msgReq;
      }

      if (allowMsgOverride && msgReq) {
        return msgReq;
      }

      if (requestMode === 'preset') {
        const resolved = resolvePreset(defaultPreset, activeSeries, {
          maxGap,
          maxBlockSize,
        });
        return {
          blocks: resolved.blocks,
          registers: resolved.registers,
          presetUsed: resolved.preset,
          seriesUsed: resolved.series,
        };
      }

      // requestMode === 'custom'
      return {
        blocks: defaultBlocks,
        registers: defaultRegisters,
        presetUsed: null,
        seriesUsed: activeSeries,
      };
    }

    async function executeJob(job, pacingWaitMs) {
      const { msg, send, done } = job;

      if (!dongle || !dongle.client) {
        sendErrorToSecondOutput(job, new Error('Missing dongle configuration'), {
          pacingWaitMs,
        });
        return;
      }

      let resolvedReq;
      try {
        resolvedReq = resolveJobRequest(msg);
      } catch (reqErr) {
        sendErrorToSecondOutput(job, reqErr, { pacingWaitMs });
        return;
      }

      const { blocks, registers, presetUsed, seriesUsed } = resolvedReq;

      if (!Array.isArray(blocks) || blocks.length === 0) {
        sendErrorToSecondOutput(job, new Error('No register blocks configured to read'), {
          pacingWaitMs,
        });
        return;
      }

      const queueNote = pendingQueue.length > 0 ? ` · ${pendingQueue.length} queued` : '';
      node.status({ fill: 'blue', shape: 'dot', text: `polling V5...${queueNote}` });

      const jobStart = Date.now();
      let blocksCompleted = 0;

      try {
        const result = {};
        const rawValues = {};
        const rawBlocks = [];

        for (let i = 0; i < blocks.length; i++) {
          if (isClosed) {
            throw new Error('Node closed during poll');
          }
          if (i > 0 && blockDelayMs > 0) {
            await sleep(blockDelayMs);
            if (isClosed) throw new Error('Node closed during poll');
          }

          const block = blocks[i];
          const startAddress = Number(block.startAddress);
          const registerCount = Number(block.registerCount);
          const functionCode = Number(block.functionCode) || 0x03;

          if (
            Number.isNaN(startAddress) ||
            Number.isNaN(registerCount) ||
            registerCount <= 0
          ) {
            throw new Error(
              `Invalid block specification (${block.startAddress}:${block.registerCount})`
            );
          }

          const words = await dongle.client.readRegisters(
            startAddress,
            registerCount,
            functionCode
          );
          blocksCompleted += 1;
          rawBlocks.push({
            startAddress,
            words,
          });
          for (let offset = 0; offset < words.length; offset++) {
            rawValues[startAddress + offset] = words[offset] & 0xffff;
          }
          for (const reg of registers) {
            if (
              reg.address >= startAddress &&
              reg.address < startAddress + registerCount
            ) {
              result[reg.key] = decodeRegister(reg, words, startAddress);
            }
          }
        }

        const durationMs = Math.max(0, Date.now() - jobStart);
        recordCompletion(durationMs, blocksCompleted, true);

        const inverterTime = formatInverterTime(result);
        if (inverterTime !== null) {
          result.inverterTime = inverterTime;
        }

        const decodedCount = Object.keys(result).length;
        if (registers.length > 0) {
          result.raw = rawValues;
        }

        const originalTopic = msg.topic;
        msg.payload = registers.length > 0 ? result : rawBlocks;
        msg.solarman = {
          loggerSn: dongle.loggerSn,
          host: dongle.host,
          series: seriesUsed,
          preset: presetUsed,
          blocksPolled: blocks.length,
          durationMs,
          rawBlocks,
        };

        const statsMsg = buildStatsMessage(
          originalTopic,
          'ok',
          {
            ok: true,
            durationMs,
            blocksPolled: blocksCompleted,
            registersDecoded: decodedCount,
            preset: presetUsed,
            error: null,
          },
          pacingWaitMs
        );

        node.status({
          fill: 'green',
          shape: 'dot',
          text: `ok (${blocks.length} blk · ${durationMs}ms)`,
        });
        send([msg, null, statsMsg]);
        if (done) done();
      } catch (err) {
        const durationMs = Math.max(0, Date.now() - jobStart);
        sendErrorToSecondOutput(job, err, {
          durationMs,
          blocksCount: blocksCompleted,
          pacingWaitMs,
        });
      }
    }

    async function drainQueue() {
      if (isRunning || isClosed) return;
      isRunning = true;
      try {
        while (!isClosed && pendingQueue.length > 0) {
          let pacingWaitMs = 0;
          if (paceMs > 0 && lastJobEndTime > 0) {
            const elapsed = Date.now() - lastJobEndTime;
            pacingWaitMs = Math.max(0, paceMs - elapsed);
            if (pacingWaitMs > 0) {
              node.status({
                fill: 'yellow',
                shape: 'dot',
                text: `pacing ${pacingWaitMs}ms · ${pendingQueue.length} queued`,
              });
              await sleep(pacingWaitMs);
              if (isClosed) break;
            }
          }

          const nextJob = pendingQueue.shift();
          if (!nextJob) break;
          await executeJob(nextJob, pacingWaitMs);
          lastJobEndTime = Date.now();
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

      totals.received += 1;
      const job = { msg, send, done };

      if (isRunning) {
        if (queueMode === 'drop') {
          totals.dropped += 1;
          const statsMsg = buildStatsMessage(msg.topic, 'dropped', null, 0);
          node.status({ fill: 'yellow', shape: 'ring', text: 'busy · dropped input' });
          send([null, null, statsMsg]);
          if (done) done();
          return;
        }

        if (queueMode === 'latest') {
          while (pendingQueue.length > 0) {
            const superseded = pendingQueue.shift();
            totals.coalesced += 1;
            if (superseded && superseded.done) superseded.done();
          }
          pendingQueue.push(job);
          const statsMsg = buildStatsMessage(msg.topic, 'coalesced', null, 0);
          node.status({ fill: 'blue', shape: 'dot', text: 'polling V5... · 1 latest queued' });
          send([null, null, statsMsg]);
          return;
        }

        // queueMode === 'fifo'
        if (pendingQueue.length >= maxQueue) {
          totals.dropped += 1;
          sendErrorToSecondOutput(
            job,
            new Error(`Read job queue full (max ${maxQueue} pending)`),
            {
              eventStatus: 'queue_full',
              countAsCompletion: false,
            }
          );
          return;
        }

        pendingQueue.push(job);
        node.status({
          fill: 'blue',
          shape: 'dot',
          text: `polling V5... · ${pendingQueue.length} queued`,
        });
        return;
      }

      pendingQueue.push(job);
      drainQueue();
    });

    node.on('close', (done) => {
      isClosed = true;
      for (const timer of activeTimers) {
        clearTimeout(timer);
      }
      activeTimers.clear();
      while (pendingQueue.length > 0) {
        const canceled = pendingQueue.shift();
        if (canceled && canceled.done) canceled.done();
      }
      if (typeof done === 'function') done();
    });
  }

  RED.nodes.registerType('deye-solarman-read', DeyeSolarmanReadNode);
};
