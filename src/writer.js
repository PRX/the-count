// const fs = require('fs');

exports.handler = async (event) => {
  console.log(JSON.stringify(event));

  const logLines = event.Records.map(r => Buffer.from(r.kinesis.data, 'base64').toString('ascii'));
  console.log(JSON.stringify(logLines));
  // fs.writeFileSync('/mnt/action-logs/this', 'tktktk')
};
