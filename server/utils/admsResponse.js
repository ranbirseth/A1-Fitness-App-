function buildGetRequestResponse(command) {
  if (command && command.commandId != null && command.commandString) {
    return `C:${command.commandId}:${command.commandString}`;
  }
  return "\n";
}

function buildCdataResponse(results) {
  const count = Array.isArray(results) ? results.length : 0;
  return count > 0 ? `OK: ${count}` : "OK";
}

module.exports = { buildGetRequestResponse, buildCdataResponse };