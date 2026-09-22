const http = require("http");
const { handleGetRequest, handleCdata, handleDeviceCmd } = require("../controllers/adms.controller");

const ADMS_PORT = Number(process.env.ADMS_PORT || 8081);
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve(value);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(Object.assign(new Error("ADMS request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const rawText = Buffer.concat(chunks).toString("utf8");

      // Force a clear debug snapshot to show exactly what characters leave the machine hardware!
      console.log("[adms-stream-debug] Raw Buffer Length Received:", rawText.length);
      console.log("[adms-stream-debug] Raw Payload Content:", rawText);

      finish(null, rawText);
    });
    req.on("error", (err) => finish(err));
  });
}

function respondError(res, err) {
  const statusCode = err && err.statusCode ? err.statusCode : 500;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain");
  res.end(err && err.message ? err.message : "Internal Server Error");
}

function createAdmsServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      console.log(`[adms] Connection Ping: ${req.method} ${url.pathname}`);
      const lowerPath = url.pathname.toLowerCase();
      if (req.method === "GET" && (lowerPath === "/iclock/getrequest" || lowerPath === "/iclock/getrequest.aspx")) {
        await handleGetRequest(req, res, url);
        return;
      }
      if (req.method === "POST" && (lowerPath === "/iclock/devicecmd" || lowerPath === "/iclock/devicecmd.aspx")) {
        const body = await readBody(req);
        await handleDeviceCmd(req, res, url, body);
        return;
      }
      if ((req.method === "POST" || req.method === "GET") && (lowerPath === "/iclock/cdata" || lowerPath === "/iclock/cdata.aspx")) {
        // Allow GET streams to read query parameters if the request body stream is empty
        const body = await readBody(req);
        await handleCdata(req, res, url, body);
        return;
      }
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not Found");
    } catch (err) {
      respondError(res, err);
    }
  });
}

function startAdmsServer() {
  const admsServer = createAdmsServer();
  admsServer.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[adms] Port ${ADMS_PORT} is already in use. ADMS server NOT started. Main API continues on port 5000.`
      );
    } else {
      console.error("[adms] ADMS server error:", err.message);
    }
  });
  admsServer.listen(ADMS_PORT, () => {
    console.log(`[adms] ADMS server running on port ${ADMS_PORT}`);
  });
  return admsServer;
}

module.exports = { createAdmsServer, startAdmsServer, ADMS_PORT, readBody };