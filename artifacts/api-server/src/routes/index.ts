import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import videosRouter from "./videos/index.js";
import voicesRouter from "./voices/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(videosRouter);
router.use(voicesRouter);

export default router;
