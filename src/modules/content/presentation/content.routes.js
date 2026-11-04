import { Router } from 'express';

export const createContentRouter = ({ contentController }) => {
  const router = Router();

  // Public endpoints
  router.get('/', contentController.listPublishedContent);
  router.get('/policies', contentController.listPolicies);
  router.get('/policies/:slug', contentController.getPolicyBySlug);
  router.get('/faqs', contentController.listFaqs);
  router.get('/stories', contentController.listStories);
  router.get('/tips', contentController.listTips);

  return router;
};

