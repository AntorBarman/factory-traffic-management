import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import sensorEventsRouter from './api/routes/sensor-events';
import junctionsRouter from './api/routes/junctions';
import commandsRouter from './api/routes/commands';
import controllerEventsRouter from './api/routes/controller-events';
import historyRouter from './api/routes/history';
import { startBackgroundWorker } from './application/background-worker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', sensorEventsRouter);
app.use('/api', junctionsRouter);
app.use('/api', commandsRouter);
app.use('/api', controllerEventsRouter);
app.use('/api', historyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚦 Factory Traffic Backend running on http://localhost:${PORT}`);
  startBackgroundWorker();
});