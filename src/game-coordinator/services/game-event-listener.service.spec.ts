import { Test, TestingModule } from '@nestjs/testing';
import { GameEventListenerService } from './game-event-listener.service';
import { Environment } from '@/environment/environment';
import { mongooseTestingModule } from '@/utils/testing-mongoose-module';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { LogReceiverService } from '@/log-receiver/services/log-receiver.service';
import { Subject, take } from 'rxjs';
import { Events } from '@/events/events';
import { GameDocument, Game, gameSchema } from '@/games/models/game';
import { GamesService } from '@/games/services/games.service';
import { Tf2Team } from '@/games/models/tf2-team';

jest.mock('@/games/services/games.service');
jest.mock('@/log-receiver/services/log-receiver.service');

class EnvironmentStub {
  logRelayAddress = '0.0.0.0';
  logRelayPort = '1234';
}

describe('GameEventListenerService', () => {
  let service: GameEventListenerService;
  let mongod: MongoMemoryServer;
  let gamesService: GamesService;
  let gameModel: Model<GameDocument>;
  let game: GameDocument;
  let logReceiverService: jest.Mocked<LogReceiverService>;
  let connection: Connection;
  let events: Events;

  beforeAll(async () => (mongod = await MongoMemoryServer.create()));
  afterAll(async () => await mongod.stop());

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        mongooseTestingModule(mongod),
        MongooseModule.forFeature([
          {
            name: Game.name,
            schema: gameSchema,
          },
        ]),
      ],
      providers: [
        GameEventListenerService,
        { provide: Environment, useClass: EnvironmentStub },
        GamesService,
        LogReceiverService,
        Events,
      ],
    }).compile();

    service = module.get<GameEventListenerService>(GameEventListenerService);
    gameModel = module.get(getModelToken(Game.name));
    gamesService = module.get(GamesService);
    logReceiverService = module.get(LogReceiverService);
    connection = module.get(getConnectionToken());
    events = module.get(Events);

    // @ts-expect-error
    logReceiverService.data = new Subject<any>();

    service.onModuleInit();
  });

  beforeEach(async () => {
    // @ts-expect-error
    game = await gamesService._createOne();
    game.logSecret = 'SOME_LOG_SECRET';
    await game.save();
  });

  afterEach(async () => {
    await gameModel.deleteMany({});
    await connection.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // TODO These below are e2e tests - we should move them there
  describe('should handle game events', () => {
    it('match started', async () =>
      new Promise<void>((resolve) => {
        events.matchStarted.pipe(take(1)).subscribe(({ gameId }) => {
          expect(gameId).toEqual(game.id);
          resolve();
        });
        (logReceiverService.data as Subject<any>).next({
          payload: '01/26/2020 - 20:40:20: World triggered "Round_Start"',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('match ended', async () =>
      new Promise<void>((resolve) => {
        events.matchEnded.pipe(take(1)).subscribe(({ gameId }) => {
          expect(gameId).toEqual(game.id);
          resolve();
        });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:38:49: World triggered "Game_Over" reason "Reached Time Limit"',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('logs uploaded', async () =>
      new Promise<void>((resolve) => {
        events.logsUploaded.pipe(take(1)).subscribe(({ gameId, logsUrl }) => {
          expect(gameId).toEqual(game.id);
          expect(logsUrl).toEqual('http://logs.tf/2458457');
          resolve();
        });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:38:52: [TFTrue] The log is available here: http://logs.tf/2458457. Type !log to view it.',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('demo uploaded', async () =>
      new Promise<void>((resolve) => {
        events.demoUploaded.pipe(take(1)).subscribe(({ gameId, demoUrl }) => {
          expect(gameId).toEqual(game.id);
          expect(demoUrl).toEqual('https://demos.tf/427407');
          resolve();
        });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '06/19/2020 - 00:04:28: [demos.tf]: STV available at: https://demos.tf/427407',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('player connected', async () =>
      new Promise<void>((resolve) => {
        events.playerConnected
          .pipe(take(1))
          .subscribe(({ gameId, steamId }) => {
            expect(gameId).toEqual(game.id);
            expect(steamId).toEqual('76561198074409147');
            resolve();
          });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:03:44: "mały #tf2pickup.pl<366><[U:1:114143419]><>" connected, address "83.29.150.132:27005"',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('player joined team', async () =>
      new Promise<void>((resolve) => {
        events.playerJoinedTeam
          .pipe(take(1))
          .subscribe(({ gameId, steamId }) => {
            expect(gameId).toEqual(game.id);
            expect(steamId).toEqual('76561198074409147');
            resolve();
          });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:03:51: "maly<366><[U:1:114143419]><Unassigned>" joined team "Blue"',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('player disconnected', async () =>
      new Promise<void>((resolve) => {
        events.playerDisconnected
          .pipe(take(1))
          .subscribe(({ gameId, steamId }) => {
            expect(gameId).toEqual(game.id);
            expect(steamId).toEqual('76561198074409147');
            resolve();
          });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:38:43: "maly<366><[U:1:114143419]><Blue>" disconnected (reason "Disconnect by user.")',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('score reported', async () =>
      new Promise<void>((resolve) => {
        events.scoreReported
          .pipe(take(1))
          .subscribe(({ gameId, teamName, score }) => {
            expect(gameId).toEqual(game.id);
            expect(teamName).toEqual(Tf2Team.red);
            expect(score).toEqual(1);
            resolve();
          });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '06/27/2022 - 19:16:41: Team "Red" current score "1" with "6" players',
          password: 'SOME_LOG_SECRET',
        });
      }));

    it('final score reported', async () =>
      new Promise<void>((resolve) => {
        events.scoreReported
          .pipe(take(1))
          .subscribe(({ gameId, teamName, score }) => {
            expect(gameId).toEqual(game.id);
            expect(teamName).toEqual(Tf2Team.blu);
            expect(score).toEqual(2);
            resolve();
          });
        (logReceiverService.data as Subject<any>).next({
          payload:
            '01/26/2020 - 20:38:49: Team "Blue" final score "2" with "3" players',
          password: 'SOME_LOG_SECRET',
        });
      }));
  });
});