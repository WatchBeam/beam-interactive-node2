import { MethodHandlerManager } from './methods/MethodHandlerManager';
import { EventEmitter } from 'events';
import { IState } from './state/IState';

import { PermissionDeniedError } from './errors';
import { IClient } from './IClient';
import { onReadyParams } from './methods/methodTypes';
import {
    IControl,
    IInput,
    IScene,
    ISceneControlDeletion,
    ISceneData,
    ISceneDataArray,
    ITransactionCapture,
} from './state/interfaces';
import { State } from './state/State';
import { Method, Reply } from './wire/packets';
import {
    CompressionScheme,
    InteractiveSocket,
    ISocketOptions,
    State as InteractiveSocketState,
} from './wire/Socket';

export enum ClientType {
    Participant,
    GameClient,
}

export class Client extends EventEmitter implements IClient {
    public clientType: ClientType;

    public state: IState;

    protected socket: InteractiveSocket;

    private methodHandler = new MethodHandlerManager();

    constructor(clientType: ClientType) {
        super();
        this.clientType = clientType;
        this.state = new State(clientType);
        this.state.setClient(this);
        this.methodHandler.addHandler('hello', () => {
            this.emit('hello');
        });
    }

    public processMethod(method: Method<any>) {
        return this.methodHandler.handle(method);
    }

    private createSocket(options: ISocketOptions): void {
        if (this.socket) {
            // GC the old socket
            if (this.socket.getState() !== InteractiveSocketState.Closing) {
                this.socket.close();
            }
            this.socket = null;
        }
        this.socket = new InteractiveSocket(options);
        this.socket.on('method', (method: Method<any>) => {
            // Sometimes the client may also want to handle methods,
            // in these cases, if it replies we value it at a higher
            // priority than anything the state handler has. So we
            // only send that one.
            const clientReply = this.processMethod(method);
            if (clientReply) {
                this.reply(clientReply);
                return;
            }

            // Replying to a method is sometimes optional, here we let the state system
            // process a message and if it wants replies.
            const reply = this.state.processMethod(method);
            if (reply) {
                this.reply(reply);
            }
        });

        this.socket.on('open', () => this.emit('open'));
        this.socket.on('error', (err: Error) => this.emit('error', err));

        // Re-emit these for debugging reasons
        this.socket.on('message', (data: any) => this.emit('message', data));
        this.socket.on('send', (data: any) => this.emit('send', data));
        this.socket.on('close', (data: any) => this.emit('close', data));
    }

    /**
     * Sets the given options on the socket.
     */
    public setOptions(options: ISocketOptions) {
        this.socket.setOptions(options);
    }

    /**
     * Boots the connection to interactive
     */
    public open(options: ISocketOptions): this {
        this.state.reset();
        this.createSocket(options);
        this.socket.connect();
        return this;
    }

    /**
     * Closes and frees the resources associated with the interactive connection.
     */
    public close() {
        if (this.socket) {
            this.socket.close();
        }
    }

    //TODO: Actually implement compression
    /**
     * setCompression is a negotiation process between the server and our client,
     * We send the compression we support, and it sends back the agreed compression scheme
     */
    public setCompression(preferences: CompressionScheme[]): Promise<void> {
        return this.socket.execute('setCompression', {
            params: preferences,
        }).then(res => {
            this.socket.setOptions({compressionScheme: <CompressionScheme> res.scheme});
        });
    }

    public reply(reply: Reply) {
        return this.socket.reply(reply);
    }

    public getScenes(): Promise<ISceneDataArray> {
        return this.execute('getScenes', null, false);
    }

    public synchronizeScenes(): Promise<IScene[]> {
        return this.getScenes()
            .then(res => this.state.synchronizeScenes(res));
    }

    public getTime(): Promise<number> {
        return this.execute('getTime', null, false)
            .then(res => {
                return res.time;
            });
    }

    public execute(method: 'createControls', params: ISceneData, discard: false ): Promise<ISceneData>;
    public execute(method: 'ready', params: onReadyParams, discard: false ): Promise<void>;
    public execute(method: 'capture', params: ITransactionCapture, discard: false ): Promise<void>;
    public execute(method: 'getTime', params: null, discard: false ): Promise<{time: number}>;
    public execute(method: 'getScenes', params: null, discard: false ): Promise<ISceneDataArray>;
    public execute<K extends IInput>(method: 'giveInput', params: K, discard: false): Promise<void>;
    public execute(method: 'updateControls', params: ISceneDataArray, discard: false): Promise<void>;
    public execute(method: 'deleteControls', params: ISceneControlDeletion, discard: false): Promise<void>;
    public execute<T>(method: string, params: T, discard: boolean): Promise<any>
    public execute(method: string, params: any, discard: boolean): Promise<any> {
        return this.socket.execute(method, params, discard);
    }

    public createControls(_: ISceneData): Promise<IControl[]> {
        throw new PermissionDeniedError('createControls', 'Participant');
    }

    public updateControls(_: ISceneDataArray): Promise<void> {
        throw new PermissionDeniedError('updateControls', 'Participant');
    }

    public updateScenes(_: ISceneDataArray): Promise<void> {
        throw new PermissionDeniedError('updateScenes', 'Participant');
    }

    public giveInput<T extends IInput>(_: T): Promise<void> {
        throw new PermissionDeniedError('giveInput', 'GameClient');
    }

    public deleteControls(_: ISceneControlDeletion): Promise<void> {
        throw new PermissionDeniedError('deleteControls', 'Participant');
    }

    public ready(_: boolean): Promise<void> {
        throw new PermissionDeniedError('ready', 'Participant');
    }
}
