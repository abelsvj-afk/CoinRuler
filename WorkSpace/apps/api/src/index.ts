import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/status', (_req, res) => res.json({ status: 'running', ts: new Date().toISOString() }));

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API listening on :${port}`));
