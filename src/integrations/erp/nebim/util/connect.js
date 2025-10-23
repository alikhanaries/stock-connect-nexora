import { nebimConfig } from '../config/config.js';

let sessionId = null;

export const getSessionId = () => sessionId;

export const connectNebim = async () => {
  const { BASE_URL, DATABASE_NAME, USER_GROUP_CODE, USERNAME, PASSWORD, MODEL_TYPE } = nebimConfig;

  const body = {
    ModelType: MODEL_TYPE.CONNECT,
    DatabaseName: DATABASE_NAME,
    UserGroupCode: USER_GROUP_CODE,
    UserName: USERNAME,
    Password: PASSWORD,
  };

  const response = await fetch(`${BASE_URL}/IntegratorService/Connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data?.SessionID) {
    throw new Error(`Nebim Connect failed: ${data?.Message || 'No SessionID returned'}`);
  }
  sessionId = data.SessionID;
  return sessionId;
};
