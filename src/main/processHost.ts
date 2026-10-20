// Entry point of the process host utility process. See processHostProtocol.ts.
import { serveProcessRunner, type ProcessHostRequest } from "./processHostProtocol";
import { NodeProcessRunner } from "./processRunner";

const parentPort = process.parentPort;

serveProcessRunner({
  postMessage: (message) => parentPort.postMessage(message),
  onMessage: (listener) => parentPort.on("message", (event) => listener(event.data as ProcessHostRequest))
}, new NodeProcessRunner());
