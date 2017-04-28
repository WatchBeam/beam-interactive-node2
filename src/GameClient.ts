import { Client, ClientType } from './Client';
import { ISceneControlDeletion, ISceneData, ISceneDataArray } from './state/interfaces';
import { IControl } from './state/interfaces/controls/IControl';

export interface IGameClientOptions {
    /**
     * Your project version id is a unique id to your Interactive Project Version. You can retrieve one
     * from the Interactive Studio on Beam.pro in the Code step.
     */
    versionId: number;
    /**
     * An OAuth Bearer token as defined in {@link https://art.tools.ietf.org/html/rfc6750| OAuth 2.0 Bearer Token Usage}.
     */
    authToken: string;
    /**
     * An interactive server url, these should be retrieved from https://beam.pro/api/v1/interactive/hosts.
     */
    url: string;
}

export class GameClient extends Client {
    constructor() {
        super(ClientType.GameClient);
    }
    /**
     * Opens a connection to the interactive service using the provided options.
     */
    public open(options: IGameClientOptions): this {
        super.open({
            authToken: options.authToken,
            url: options.url,
            extraHeaders: {
                'X-Interactive-Version': options.versionId,
            },
        });
        return this;
    }

    /**
     * Creates instructs the server to create new controls on a scene within your project.
     * Participants will see the new controls automatically if they are on the scene the
     * new controls are added to.
     */
    public createControls(data: ISceneData): Promise<IControl[]> {
        return this.execute('createControls', data, false)
            .then(res => {
                const scene = this.state.getScene(res.sceneID);
                if (!scene) {
                    return this.state.onSceneCreate(res).getControls();
                }
                return scene.onControlsCreated(res.controls);
            });
    }

    /**
     * Updates a sessions' ready state, when a client is not ready participants cannot
     * interact with the controls.
     */
    public ready(isReady: boolean = true): Promise<void> {
        return this.execute('ready', { isReady }, false);
    }

    /**
     * Instructs the server to update controls within a scene with your specified parameters.
     * Participants on the scene will see the controls update automatically.
     */
    public updateControls(params: ISceneDataArray): Promise<void> {
        return this.execute('updateControls', params, false);
    }

    /**
     * Instructs the server to update a scene within the session with your specified parameters.
     */
    public updateScenes(scenes: ISceneDataArray): Promise<void> {
        return this.execute('updateScenes', scenes, false);
    }

    /**
     * Makes an attempt to capture a spark transaction and deduct the sparks from the participant
     * who created the transaction.
     *
     * A transaction can fail to capture if:
     *  * The participant does not have enough sparks.
     *  * The transaction is expired.
     */
    public captureTransaction(transactionID: string): Promise<void> {
        return this.execute('capture', { transactionID }, false);
    }

    /**
     * Instructs the server to delete the provided controls.
     */
    public deleteControls(data: ISceneControlDeletion): Promise<void> {
        return this.execute('deleteControls', data, false);
    }
}
