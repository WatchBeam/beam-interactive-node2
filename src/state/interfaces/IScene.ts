import { IControl, IControlData } from './controls/IControl';
import { IMeta } from './controls/IMeta';

export interface ISceneDataArray {
    scenes: ISceneData[];
}

export interface ISceneDeletionParams {
    sceneID: string;
    reassignSceneID: string;
}

export interface ISceneData {
    sceneID: string;
    controls: IControlData[];
    meta?: IMeta;
    etag?: string;
}

export interface IScene extends ISceneData {
    controls: IControl[];
    meta: IMeta;
    etag: string;
    //TODO groups
    groups: any;


    getControls(): IControl[];
    getControl(id: string): IControl;

    update(scene: ISceneData): void;
    // Frontend

    // GameClient

}
