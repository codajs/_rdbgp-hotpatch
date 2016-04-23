var hotpatch = require('..');
var rdbgp = require('rdbgp');

var client = rdbgp.connect({
  port: 9222
});

var output = hotpatch(client);
