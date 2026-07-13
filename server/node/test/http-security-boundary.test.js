"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const {PassThrough, Readable} = require("node:stream");
const test = require("node:test");
const {
  HttpBoundaryError,
  applyHttpServerLimits,
  parseOriginFormTarget,
  readBoundedJson,
  secureJsonHeaders,
  validateDeclaredBodyLimit,
} = require("../src/http-security-boundary");

function bodyRequest(chunks, headers = {}) {
  const req = Readable.from(chunks);
  req.headers = headers;
  return req;
}

test("request target accepts bounded origin-form and rejects absolute or malformed targets", () => {
  assert.equal(parseOriginFormTarget({url: "/players/online?scope=aoi"}).pathname, "/players/online");
  for (const url of ["http://example.test/path", "//example.test/path", "/bad%ZZ", "/bad%ff", `/${"x".repeat(2048)}`]) {
    assert.throws(
      () => parseOriginFormTarget({url}),
      (error) => error instanceof HttpBoundaryError && error.statusCode === 400,
    );
  }
});

test("bounded JSON accepts exact bytes and rejects content length or chunked overflow", async () => {
  const exact = Buffer.from('{"value":"1234"}');
  const parsed = await readBoundedJson(bodyRequest([exact], {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(exact.length),
  }), {maxBytes: exact.length});
  assert.deepEqual(parsed, {value: "1234"});

  assert.throws(
    () => validateDeclaredBodyLimit({headers: {"content-length": String(exact.length + 1)}}, exact.length),
    (error) => error.statusCode === 413,
  );
  await assert.rejects(
    readBoundedJson(bodyRequest([exact.subarray(0, 5), exact.subarray(5)], {
      "content-type": "application/json",
    }), {maxBytes: exact.length - 1}),
    (error) => error.statusCode === 413,
  );
});

test("JSON boundary rejects wrong content type, invalid UTF-8, malformed JSON and arrays", async () => {
  assert.throws(
    () => readBoundedJson(bodyRequest([Buffer.from("{}")], {"content-type": "text/plain"})),
    (error) => error.statusCode === 415,
  );
  for (const buffer of [Buffer.from([0xff]), Buffer.from("{"), Buffer.from("[]")]) {
    await assert.rejects(
      readBoundedJson(bodyRequest([buffer], {"content-type": "application/json"})),
      (error) => error.statusCode === 400 && error.code === "request_json_invalid",
    );
  }
});

test("secure JSON headers prevent caching and carry a server request ID", () => {
  const headers = secureJsonHeaders("req_test", 12);
  assert.equal(headers["cache-control"], "no-store");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-request-id"], "req_test");
  assert.equal(headers["content-length"], 12);
});

test("body receive deadline and explicit Node server limits fail slow clients closed", async () => {
  const stalled = new PassThrough();
  stalled.headers = {"content-type": "application/json"};
  const keepTestAlive = setTimeout(() => {}, 100);
  await assert.rejects(
    readBoundedJson(stalled, {timeoutMs: 10}),
    (error) => error.statusCode === 408 && error.code === "request_body_timeout",
  );
  clearTimeout(keepTestAlive);
  stalled.destroy();

  const server = applyHttpServerLimits(http.createServer());
  assert.equal(server.headersTimeout, 5000);
  assert.equal(server.requestTimeout, 15000);
  assert.equal(server.timeout, 30000);
  assert.equal(server.keepAliveTimeout, 5000);
  assert.equal(server.maxRequestsPerSocket, 100);
  assert.equal(server.maxHeadersCount, 64);
  assert.equal(server.maxConnections, 2048);
  server.close();
});
