import { Test } from '@nestjs/testing';
import { MdnsService } from '../../src/network/mdns.service';
import { AGENT_PORT } from '../../src/constants';

const mockStop    = jest.fn();
const mockPublish = jest.fn().mockReturnValue({ stop: mockStop });
const mockDestroy = jest.fn();

jest.mock('bonjour-service', () => ({
  Bonjour: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    destroy: mockDestroy,
  })),
}));

describe('MdnsService', () => {
  let service: MdnsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [MdnsService],
    }).compile();
    service = module.get(MdnsService);
  });

  it('publishes _controlsurface._tcp on bootstrap', () => {
    service.onApplicationBootstrap();
    expect(mockPublish).toHaveBeenCalledWith({
      name: 'KDeck Agent',
      type: 'controlsurface',
      port: AGENT_PORT,
    });
  });

  it('stops the published service on shutdown', () => {
    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    expect(mockStop).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('is safe to shutdown without bootstrapping', () => {
    expect(() => service.onApplicationShutdown()).not.toThrow();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
  });
});
