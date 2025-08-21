import bcrypt from 'bcrypt';

const saltRounds = 10;

/* FUNC TO GENERATE HASH PASSWORD */
export const generateHashPassword = async (normalPassword) => {
  return bcrypt.hashSync(normalPassword, saltRounds);
};

/* FUNC TO VERIFY PASSWORD */
export const verifyPassword = async (plainPassword, hashPass) => {
  return bcrypt.compareSync(plainPassword, hashPass);
};
