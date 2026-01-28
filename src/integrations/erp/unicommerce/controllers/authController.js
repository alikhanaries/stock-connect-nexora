import User from '#models/User.js';
import { generateTokenResponse } from '#util/token.js';
import { errorLog } from '#middleware/index.js';
import userHelper from '#helpers/User.js';

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send({ message: req.locale.MISSING_CREDENTIALS });
    }

    const user = await User.findOne({ email: username, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return res.status(404).send({ message: req.locale.NO_ACCOUNT });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).send({ message: req.locale.INVALID_CREDENTIALS });
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    if (sellerIds.length === 0) {
      return res.status(400).send({ message: req.locale.NO_SELLER_CONNECTED });
    }
    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);

    if (!tokenResponse) {
      return res.status(500).send({ message: req.locale.TOKEN_ERROR });
    }
    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return res
      .status(200)
      .send({ status: 'SUCCESS', accessToken: tokenResponse.token, sellerId: tokenResponse.sellerIds?.[0] });
  } catch (error) {
    console.error('user login Error:', error);
    errorLog(error);
    return res.status(error.statusCode || 500).send({ message: error.message });
  }
};
