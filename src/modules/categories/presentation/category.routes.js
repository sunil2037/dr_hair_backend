import { Router } from 'express';

export function createCategoryRouter({ categoryController }) {
  const router = Router();

  router.get('/', categoryController.list);
  router.get('/products', categoryController.listProducts);
  router.get('/videos', categoryController.listVideos);
  router.get('/services', categoryController.listServices);
  router.get('/concerns', categoryController.listConcerns);

  router.post('/', categoryController.create);
  router.put('/:id', categoryController.update);
  router.patch('/:id', categoryController.update);
  router.delete('/:id', categoryController.delete);

  return router;
}
