import { assert, expect, use } from 'chai';
import * as sinon from 'sinon';
import * as WebSocketModule from 'ws';

import { CancelledError, TimeoutError } from '../errors';
import { Method } from './packets';
import { ExponentialReconnectionPolicy } from './reconnection';
import { InteractiveSocket, ISocketOptions } from './Socket';

// tslint:disable-next-line:no-require-imports no-var-requires
use(require('sinon-chai'));

const port = process.env.SERVER_PORT || 1339;
const METHOD = { id: 1, type: 'method', method: 'hello', params: { foo: 'bar' }, discard: false};

describe('socket', () => {
    let server: WebSocketModule.Server;
    let socket: InteractiveSocket;

    const url = `ws://127.0.0.1:${port}/`;

    beforeEach(ready => {
        server = new WebSocketModule.Server({ port }, ready);
    });

    afterEach(done => {
        if (socket) {
            socket.close();
            socket = null;
        }
        server.close(done);
    });

    describe('connecting', () => {
        it('connects with no auth', done => {
            socket = new InteractiveSocket({ url }).connect();
            server.on('connection', (ws: WebSocketModule) => {
                expect(ws.upgradeReq.url).to.equal('/');
                expect(ws.upgradeReq.headers.authorization).to.equal(
                    undefined,
                    'authorization header should be undefined when no auth is used',
                );
                done();
            });
        });

        it('connects with JWT auth', done => {
            socket = new InteractiveSocket({ url, jwt: 'asdf!' }).connect();
            server.on('connection', (ws: WebSocketModule) => {
                expect(ws.upgradeReq.url).to.equal('/?jwt=asdf!');
                expect(ws.upgradeReq.headers.authorization).to.equal(
                    undefined,
                    'authorization header should be undefined when jwt auth is used',
                );
                done();
            });
        });

        it('connects with an OAuth token', done => {
            socket = new InteractiveSocket({ url, authToken: 'asdf!' }).connect();
            server.on('connection', (ws: WebSocketModule) => {
                expect(ws.upgradeReq.url).to.equal('/');
                expect(ws.upgradeReq.headers.authorization).to.equal('Bearer asdf!');
                done();
            });
        });

        it('throws an error on ambiguous auth', () => {
            expect(() => new InteractiveSocket({ url, authToken: 'asdf!', jwt: 'wat?' }))
                .to.throw(/both JWT and OAuth token/);
        });
    });

    describe('sending packets', () => {
        let ws: WebSocketModule;
        let next: sinon.SinonStub;
        let reset: sinon.SinonStub;

        function greet() {
            ws.send(JSON.stringify(METHOD));
        }

        function awaitConnect(callback: Function) {
            server.once('connection', (_ws: WebSocketModule) => {
                ws = _ws;
                callback(ws);
            });
        }

        function assertAndReplyTo(payload: any) {
            const data = JSON.parse(payload);
            expect(data).to.deep.equal(
                {
                    id: data.id,
                    type: 'method',
                    method: 'hello',
                    discard: false,
                    params: {
                        foo: 'bar',
                    },
                },
                'received method should match sent method',
            );
            ws.send(JSON.stringify({
                type: 'reply',
                id: data.id,
                error: null,
                result: 'hi',
            }));
        }

        beforeEach(ready => {
            awaitConnect(() => ready());
            socket = new InteractiveSocket({ url, pingInterval: 100, replyTimeout: 50 }).connect();
            const options: ISocketOptions  = {
                reconnectionPolicy: new ExponentialReconnectionPolicy(),
            };
            next = sinon.stub(options.reconnectionPolicy, 'next').returns(5);
            reset = sinon.stub(options.reconnectionPolicy, 'reset');
            socket.setOptions(options);
        });

        it('reconnects if a connection is lost using the backoff interval', done => {
            expect(reset).to.not.have.been.called;
            expect(next).to.not.have.been.called;
            greet();

            // Initially greets and calls reset
            socket.once('open', () => {
                expect(reset).to.have.been.calledOnce;
                ws.close();

                // Backs off when a healthy connection is lost
                awaitConnect((newWs: WebSocketModule) => {
                    expect(next).to.have.been.calledOnce;
                    expect(reset).to.have.been.calledOnce;
                    newWs.close();

                    // Backs off again if establishing fails
                    awaitConnect(() => {
                        expect(next).to.have.been.calledTwice;
                        expect(reset).to.have.been.calledTwice;
                        greet();

                        // Resets after connection is healthy again.
                        socket.once('open', () => {
                            expect(reset).to.have.been.calledThrice;
                            socket.close();
                            done();
                        });
                    });
                });
            });
        });

        it('respects closing the socket during a reconnection', done => {
            greet();
            socket.once('method', () => ws.close());
            setTimeout(() => socket.close(), 1);

            awaitConnect(() => {
                assert.fail('Expected not to have reconnected with a closed socket');
            });
            setTimeout(
                () => {
                    done();
                },
                20,
            );
        });

        it('times out message calls if no reply is received', () => {
            socket.setOptions({replyTimeout: 5});
            return socket.execute('hello', { foo: 'bar'})
            .catch(err => expect(err).to.be.an.instanceof(TimeoutError));
        });

        it('retries messages if the socket is closed before replying', () => {
            ws.on('message', () => {
                 ws.close();
            });
            awaitConnect((newWs: WebSocketModule) => {
                newWs.on('message', (payload: any) => {
                    assertAndReplyTo(payload);
                    expect(socket.getQueueSize()).to.equal(1);
                });
            });

            return socket.execute('hello', { foo: 'bar'})
            .then(res => {
                expect(res).to.equal('hi');
            });
        });

        it('recieves a reply to a method', () => {
            ws.on('message', payload => {
                assertAndReplyTo(payload);
            });

            return socket.execute('hello', { foo: 'bar'})
            .then(res => {
                expect(res).to.equal('hi');
            });
        });

        it('emits a method sent to it', done => {
            ws.send(JSON.stringify(METHOD));
            socket.on('method', (method: Method<any>) => {
                expect(method).to.deep.equal(Method.fromSocket(METHOD));
                done();
            });
        });

        it('cancels packets if the socket is closed mid-call', () => {
            ws.on('message', () => socket.close());
            return socket.execute('hello', { foo: 'bar'})
            .catch(err => expect(err).be.an.instanceof(CancelledError));
        });
    });
});