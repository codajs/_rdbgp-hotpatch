# Remote Debugging Protocol Hotpatch

## Installation

```console
$ npm install codajs/rdbgp-hotpatch
```

## Usage

```javascript
var rdbgp = require('rdbgp');
var hotpatch = require('rdbgp-hotpatch');

var client = rdbgp.connect();

var options = {
  // Optional, function used to resolve urls into filepaths.
  // The default resolves relative to the current working directory.
  resolve: function (url, callback) {
  }, 
};

hotpatch(client, options);
```

## License

MIT.
