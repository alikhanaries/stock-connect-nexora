import express from 'express';
import { getImportList, addToImportList, removeFromImportList } from '#controllers/ImportListController.js';
import { authMiddleware } from '#middleware/index.js';

const importListRouter = express.Router();

importListRouter.use(authMiddleware);

importListRouter.post('/', addToImportList);
importListRouter.get('/', getImportList);
importListRouter.delete('/:id', removeFromImportList);

export default importListRouter;
