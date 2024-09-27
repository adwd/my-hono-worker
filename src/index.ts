import { Hono } from 'hono'
export { MyDurableObject } from './durable-objcts';

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/', async (c) => {
  const objectId = c.env.MY_DURABLE_OBJECT.idFromName('my-durable-object');
  await c.env.MY_DURABLE_OBJECT.get(objectId).initializeFlight(['1A', '1B', '1C', '1D', '1E', '1F']);
  const availableSeats = await c.env.MY_DURABLE_OBJECT.get(objectId).getAvailable();
  return c.json(availableSeats);
})

export default app