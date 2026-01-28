import productService from '../services/productService.js';

export const fetchProductCount = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return res.status(400).send({ message: 'sellerId is missing' });
    }
    const { publishedStatus } = req.query;

    if (!publishedStatus || typeof publishedStatus !== 'string') {
      return res.status(400).send({ message: 'Published status is required' });
    }

    if (publishedStatus.toUpperCase() !== 'PUBLISHED') {
      return res.status(400).send({ message: 'Published status must be PUBLISHED' });
    }

    const result = await productService.fetchProductsCount(sellerId, publishedStatus);

    return res.status(200).send({ count: result.count });
  } catch (error) {
    console.error('unicommerce fetchProductCount error:', error.message, error.stack);
    return res.status(error.statusCode || 500).send({ message: error.message });
  }
};
