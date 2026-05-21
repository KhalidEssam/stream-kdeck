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
});
