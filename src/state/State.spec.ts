import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { Method } from '../wire/packets';
import { IControl } from './interfaces/controls/IControl';
import { ISceneDataArray } from './interfaces/IScene';
import { State } from './State';

function loadFixture(name: string): ISceneDataArray {
    return JSON.parse(fs.readFileSync(name).toString());
}

describe('state', () => {
    let state: State;
    function initializeState(fixture: string) {
        state = new State();
        const data = loadFixture(path.join(__dirname, '../../test/fixtures', fixture));
        state.initialize(data.scenes);
    }
    describe('initialization', () => {
        it('initializes state from an initial scene list', () => {
            initializeState('testGame.json');
            const scene = state.getScene('my awesome scene');
            expect(scene).to.exist;
        });
    });
    describe('scenes', () => {
        before(() => {
            initializeState('testGame.json');
        });
        it('finds a scene by id', () => {
            const targetScene = 'my awesome scene';
            const scene = state.getScene(targetScene);
            expect(scene).to.exist;
            expect(scene.sceneID).to.be.equal(targetScene);
        });
        it('initializes a scene from a method', () => {
            const method = new Method(
                'onSceneCreate',
                {
                    scenes: [
                        {
                            sceneID: 'scene2',
                            etag: '252185589',
                            controls: [
                                {
                                    controlID: 'button2',
                                    etag: '262111379',
                                    kind: 'button',
                                    text: 'Win the Game',
                                    cost: 0,
                                    progress: 0.25,
                                    disabled: false,
                                    meta: {
                                        glow: {
                                            etag: '254353748',
                                            value: {
                                                color: '#f00',
                                                radius: 10,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            );
            state.processMethod(method);
            const scene = state.getScene('scene2');
            expect(scene).to.exist;
            expect(scene.sceneID).to.equal('scene2');
            const controlInScene = scene.getControl('button2');
            expect(controlInScene).to.exist;
            expect(controlInScene.controlID).to.equal('button2');
        });
        it('deletes a scene', () => {
            const method = new Method(
                'onSceneDelete',
                {
                    sceneID: 'scene2',
                    reassignSceneID: 'my awesome scene',
                },
            );
            state.processMethod(method);
            const scene = state.getScene('scene2');
            expect(scene).to.not.exist;
        });
        it('updates a scene', () => {
            const meta = {
                glow: {
                    etag: '254353748',
                    value: {
                        color: '#f00',
                        radius: 10,
                    },
                },
            };
            const method = new Method(
                'onSceneUpdate',
                {
                    scenes: [
                        {
                            sceneID: 'my awesome scene',
                            meta: meta,
                        },
                    ],
                },
            );
            state.processMethod(method);
            const scene = state.getScene('my awesome scene');
            expect(scene).to.exist;
            expect(scene.meta).to.deep.equal(meta);
        })
    });

    describe('controls', () => {
        let control: IControl;
        before(() => {
            initializeState('testGame.json');
        });
        it('finds a control by id', () => {
            const targetControl = 'win_the_game_btn';
            control = state.getControl(targetControl);
            expect(control).to.exist;
            expect(control.controlID).to.be.equal(targetControl);
        });
        it('applies an update to a control', done => {
            control = state.getControl('win_the_game_btn');
            expect(control).to.exist;
            control.on('updated', () => {
                expect(control.disabled).to.equal(true, 'expect control to be disabled');
                done();
            });
            state.processMethod(new Method(
                'onControlUpdate',
                {
                    scenes: [
                        {
                            sceneID: 'my awesome scene',
                            controls: [
                                {
                                    controlID: 'win_the_game_btn',
                                    disabled: true,
                                },
                            ],
                        },
                    ],
                },
            ));
        });
        it('creates and places a new control within the state tree', done => {
            const scene = state.getScene('my awesome scene');
            scene.on('controlAdded', (addedControl: IControl) => {
                expect(addedControl.controlID).to.equal('lose_the_game_btn');
                const foundControl = state.getControl('lose_the_game_btn');
                expect(foundControl).to.exist;
                done();
            });
            state.processMethod(new Method(
                'onControlCreate',
                {
                    sceneID: 'my awesome scene',
                    controls: [
                        {
                            controlID: 'lose_the_game_btn',
                            etag: '262111379',
                            kind: 'button',
                            text: 'Lose the Game',
                            cost: 0,
                            progress: 0.25,
                            disabled: false,
                            meta: {
                                glow: {
                                    etag: '254353748',
                                    value: {
                                        color: '#f00',
                                        radius: 10,
                                    },
                                },
                            },
                        },
                    ],
                },
            ));
        });
        it('deletes a control', done => {
            const scene = state.getScene('my awesome scene');
            // TODO How do we overload this?
            scene.on('controlDeleted', (eventControl: IControl) => {
                expect(eventControl.controlID).to.equal('lose_the_game_btn');
                const searchControl = scene.getControl('lose_the_game_btn');
                expect(searchControl).to.not.exist;
                done();
            });
            state.processMethod(new Method(
                'onControlDelete',
                {
                    sceneID: 'my awesome scene',
                    controls: [{
                        controlID: 'lose_the_game_btn',
                    }],
                },
            ));
        });
    });
});

