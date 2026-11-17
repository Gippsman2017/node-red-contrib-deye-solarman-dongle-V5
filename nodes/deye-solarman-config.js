'use strict';

const { SolarmanV5Client } = require('../lib/solarman-v5');

module.exports = function (RED) {
  function DeyeSolarmanConfigNode(n) {
    RED.nodes.createNode(this, n);
    this.host = n.host;
    this.port = Number(n.port) || 8899;
    this.loggerSn = Number(n.loggerSn);
    this.unitId = Number(n.unitId) || 1;
    this.timeout = Number(n.timeout) || 3000;
    this.retries = n.retries !== undefined && n.retries !== '' ? Number(n.retries) : 1;
    this.series = n.series || 'SG04LP3';

    this.client = new SolarmanV5Client({
      host: this.host,
      port: this.port,
      loggerSn: this.loggerSn,
      unitId: this.unitId,
      timeout: this.timeout,
      retries: this.retries,
    });
  }

  RED.nodes.registerType('deye-solarman-config', DeyeSolarmanConfigNode);
};
