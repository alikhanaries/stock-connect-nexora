let dbReady = false;
let queueReady = false;
let shuttingDown = false;

export const setDbReady = (value) => {
  dbReady = value;
};

export const setQueueReady = (value) => {
  queueReady = value;
};

export const setShuttingDown = (value) => {
  shuttingDown = value;
};

export const isShuttingDown = () => shuttingDown;

export const isServerReady = () => dbReady && queueReady && !shuttingDown;
