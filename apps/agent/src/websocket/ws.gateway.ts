import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';

@WebSocketGateway(3001)
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(): void {}
}
