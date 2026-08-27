import mongoose from 'mongoose';

const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  error?.codeName === 'IllegalOperation' ||
  (error?.message || '').includes('replica set');

export async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (error) {
      if (isTransactionUnsupported(error)) {
        return await work(null);
      }
      throw error;
    }
  } finally {
    await session.endSession();
  }
}
