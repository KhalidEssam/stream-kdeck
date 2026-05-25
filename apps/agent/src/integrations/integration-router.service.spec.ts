import { IntegrationRouterService } from './integration-router.service';
import { IntegrationAdapter } from './integration.adapter';

const makeAdapter = (slug: string, actionIds: string[]): IntegrationAdapter => ({
  pluginSlug: slug,
  canExecute: (id) => actionIds.includes(id),
  execute: jest.fn().mockResolvedValue({ success: true }),
});

describe('IntegrationRouterService', () => {
  let router: IntegrationRouterService;

  beforeEach(() => {
    router = new IntegrationRouterService();
  });

  it('dispatches to the correct adapter by actionId', async () => {
    const obs = makeAdapter('obs', ['obs.stream.start']);
    router.register(obs);

    const result = await router.dispatch('obs.stream.start', {});
    expect(result.success).toBe(true);
    expect(obs.execute).toHaveBeenCalledWith('obs.stream.start', {});
  });

  it('returns error when no adapter handles actionId', async () => {
    const result = await router.dispatch('unknown.action', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no adapter/i);
  });

  it('validates required params before dispatch', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = { type: 'object', required: ['sceneName'], properties: { sceneName: { type: 'string' } } };

    const result = await router.dispatch('obs.scene.switch', {}, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sceneName/);
  });

  it('passes valid params through to adapter', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = { type: 'object', required: ['sceneName'], properties: { sceneName: { type: 'string' } } };

    const result = await router.dispatch('obs.scene.switch', { sceneName: 'Gaming' }, schema);
    expect(result.success).toBe(true);
    expect(obs.execute).toHaveBeenCalledWith('obs.scene.switch', { sceneName: 'Gaming' });
  });

  it('rejects param with wrong type', async () => {
    const obs = makeAdapter('obs', ['obs.input.mute.set']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['inputName', 'muted'],
      properties: {
        inputName: { type: 'string' },
        muted: { type: 'boolean' },
      },
    };

    const result = await router.dispatch('obs.input.mute.set', { inputName: 'Mic', muted: 'yes' }, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/muted/);
    expect(result.error).toMatch(/boolean/);
  });

  it('rejects param not in enum list', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['start', 'stop'] },
      },
    };

    const result = await router.dispatch('obs.scene.switch', { mode: 'pause' }, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mode/);
    expect(result.error).toMatch(/start.*stop|stop.*start/);
  });

  it('accepts param that matches enum', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['start', 'stop'] },
      },
    };

    const result = await router.dispatch('obs.scene.switch', { mode: 'start' }, schema);
    expect(result.success).toBe(true);
  });

  it('skips type check for absent optional params', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      properties: {
        optionalFlag: { type: 'boolean' },
      },
    };

    const result = await router.dispatch('obs.scene.switch', {}, schema);
    expect(result.success).toBe(true);
  });

  it('accepts boolean and number strings from mobile text inputs', async () => {
    const obs = makeAdapter('obs', ['obs.input.volume.set']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['inputName', 'muted', 'volume'],
      properties: {
        inputName: { type: 'string' },
        muted: { type: 'boolean' },
        volume: { type: 'number' },
      },
    };

    const result = await router.dispatch(
      'obs.input.volume.set',
      { inputName: 'Mic', muted: 'false', volume: '0.8' },
      schema,
    );
    expect(result.success).toBe(true);
  });
});
