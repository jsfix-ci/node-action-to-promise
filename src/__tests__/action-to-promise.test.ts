import { createAction2PromiseWrapper, dispatchStartAction, actionFromPromiseAction, IAction2PromiseWrapper, ActionEntryType, ISagaTakeEffectWatcher, ISagaEffectIds, IActionEntries, EffectIdKind } from '../action-to-promise';
import { createStore, applyMiddleware, compose, Action, AnyAction } from "redux";
import { take, fork, actionChannel, call, put } from 'redux-saga/effects';
import { buffers, END } from 'redux-saga';

//declare global {
//    interface Window { __REDUX_DEVTOOLS_EXTENSION_COMPOSE__: any }
//}

const storeEnhancers = /*window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ||*/ compose;

interface IStore {
    fetching: boolean;
    data: string;
}

const mmInitialState: IStore = {
    fetching: false,
    data: ""
};

function reducerRoot(state: IStore = mmInitialState, action: AnyAction): IStore {
    if (action.type === "REQUEST") {
        const state_update = {
            fetching: true
        }

        return Object.assign({}, state, state_update);
    }

    if (action.type === "LOADED") {
        // create copy of the state
        const new_state = Object.assign({}, state);

        const state_update = {
            fetching: false,
            data: action.payload,
        }

        return Object.assign(new_state, state_update);
    }

    return state;
};

const requestData = (): string => {
    return "Tratatata";
}

const requestDataFail = (): never => {
    throw new Error("Sorry Shorty");
}

const acDataRequest = (): AnyAction => {
    return { type: "REQUEST" };
}

const acDataLoaded = (data: string): AnyAction => {
    return { type: "LOADED", payload: data };
}

const acDataRequestErrored = (e: any): AnyAction => {
    return { type: "REQUEST_ERROR", payload: e };
}

function* workerSagaGetData(org_action: AnyAction) {
    try {
        let payload = yield call(requestData);
        yield put(acDataLoaded(payload));
    } catch (e) {
        yield put(acDataRequestErrored(e));
    }
}

function* workerSagaGetDataWithFailure(org_action: AnyAction) {
    try {
        let payload = yield call(requestDataFail);
        yield put(acDataLoaded(payload));
    } catch (e) {
        yield put(acDataRequestErrored(e));
    }
}

function* watcherSagaChannelAndFork() {
    const actChan = yield actionChannel("REQUEST", buffers.fixed());

    while (true) {
        const action = yield take(actChan);
        const org_action = actionFromPromiseAction(action);
        yield fork(workerSagaGetData, org_action);
    }
}

function* watcherSagaFork() {
    while (true) {
        const action = yield take("REQUEST");
        const org_action = actionFromPromiseAction(action);
        yield fork(workerSagaGetData, org_action);
    }
}

function* watcherSagaForkWithFailure() {
    while (true) {
        const action = yield take("REQUEST");
        const org_action = actionFromPromiseAction(action);
        yield fork(workerSagaGetDataWithFailure, org_action);
    }
}

function* watcherSagaChannelAndCall() {
    const actChan = yield actionChannel("REQUEST", buffers.fixed());

    while (true) {
        const action = yield take(actChan);
        const org_action = actionFromPromiseAction(action);
        yield call(workerSagaGetData, org_action);
    }
}

function* watcherSagaCall() {
    while (true) {
        const action = yield take("REQUEST");
        const org_action = actionFromPromiseAction(action);
        yield call(workerSagaGetData, org_action);
    }
}

interface ITestResult {
    sagaTakeEffectsWatcher: ISagaTakeEffectWatcher,
    sagaEffectIds: ISagaEffectIds,
    actionEntries: IActionEntries
}

interface ITestResults {
    [index: string]: ITestResult;
}

interface ICreateTestObjectReturnType {
    getMonitor: any;
    getTestResults: () => ITestResults
}

const createTestObject = (action2PromiseWrapper: IAction2PromiseWrapper): ICreateTestObjectReturnType => {
    let step = 1;
    const testResults: ITestResults = {};
    let takeEffectId = 0;
    let putEffectId = 0;

    const registerTestState = (indx: number): void => {
        // create deep copy without functions
        const sagaEffectIds = action2PromiseWrapper.testObject.getSagaEffectIds();
        const new_sagaEffectIds = JSON.parse(JSON.stringify(sagaEffectIds));

        // now copy resolve & reject functions
        for (let p in sagaEffectIds) {
            new_sagaEffectIds[p]['resolve'] = sagaEffectIds[p]['resolve'];
            new_sagaEffectIds[p]['reject'] = sagaEffectIds[p]['reject'];
        }

        testResults[indx] = {
            sagaTakeEffectsWatcher: JSON.parse(JSON.stringify(action2PromiseWrapper.testObject.getSagaTakeEffectsWatcher())),
            sagaEffectIds: new_sagaEffectIds,
            actionEntries: JSON.parse(JSON.stringify(action2PromiseWrapper.testObject.getActionEntries()))
        };
    };

    const getMonitor = () => {
        const monitor = {
            effectTriggered: ({ effectId, parentEffectId, label, effect }: { effectId: number, parentEffectId: number, label: string, effect: any }) => {
                if (step === 1) {
                    if (effect.type === take().type) {
                        takeEffectId = effectId;
                        registerTestState(step);
                        step++;
                    }
                }
                else if (step === 3) {
                    if ((effect.type === fork(() => { }).type) || (effect.type === call(() => { }).type)) {
                        registerTestState(step);
                        step++;
                    }
                }
                else if (step === 4) {
                    if (effect.type === put({ type: '' }).type) {
                        putEffectId = effectId;
                        registerTestState(step);
                        step++;
                    }
                }
            },
            effectResolved: (effectId: number, result: any) => {
                if (step === 2) {
                    if (effectId === takeEffectId) {
                        registerTestState(step);
                        step++;
                    }
                }
                else if(step === 5) {
                    if (effectId === putEffectId) {
                        registerTestState(step);
                        step++;
                    }
                }
            },
            effectRejected: (effectId: number, error: any) => {
            },
            effectCancelled: (effectId: number) => {
            },
            actionDispatched: (action: Action) => {
            }
        }

        return monitor;
    };

    const getTestResults = (): ITestResults => testResults;

    return { getMonitor, getTestResults };
};


describe(`[action-to-promise] testing component`, () => {
    describe(`testing registration of action triple`, () => {
        let action2PromiseWrapper: IAction2PromiseWrapper;

        beforeAll(async () => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
        });

        test(`registration of action triple `, async () => {
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null
                    }
                },
            };

            expect(action2PromiseWrapper.testObject.getActionEntries()).toEqual(expected_actionEntries);
        });

        test(`registration of another action triple with repeated resolve & reject actions`, async () => {
            action2PromiseWrapper.registerActions({ start: "REQUEST2", resolve: "LOADED", reject: "REQUEST_ERROR" });

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'REQUEST2': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                        ['REQUEST2']: null
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                        ['REQUEST2']: null
                    }
                },
            };

            expect(action2PromiseWrapper.testObject.getActionEntries()).toEqual(expected_actionEntries);
        });

        test(`registration of yet another action triple with unique resolve & reject actions`, async () => {
            action2PromiseWrapper.registerActions({ start: "REQUEST3", resolve: "LOADED3", reject: "REQUEST_ERROR3" });

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'REQUEST2': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'REQUEST3': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                        ['REQUEST2']: null
                    }
                },
                'LOADED3': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST3']: null
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                        ['REQUEST2']: null
                    }
                },
                'REQUEST_ERROR3': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST3']: null
                    }
                },
            };

            expect(action2PromiseWrapper.testObject.getActionEntries()).toEqual(expected_actionEntries);
        });

        test(`registration of already registered start action`, async () => {
            expect(() => {
                action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            }).toThrow();
        });
    });

    describe(`Channel + Fork for regular action case`, () => {
        let action2PromiseWrapper: any;
        let testObject: ICreateTestObjectReturnType;

        beforeAll(async () => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

            const sagaTask = initialiseSagaMiddleware.run(watcherSagaChannelAndFork);

            store.dispatch(acDataRequest());     // note: action is regular this way
            store.dispatch(END);                 // request end

            return sagaTask.toPromise();
        });

        test(`testing interception of TAKE effect (regular action case)`, async () => {
            const result = testObject.getTestResults()[1];
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(1);
            expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
            expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
        });

        test(`testing resolving of TAKE effect (regular action case)`, async () => {
            const result = testObject.getTestResults()[2];

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            expect(action2PromiseWrapper.testObject.getActionEntries()).toEqual(expected_actionEntries);               // actionEntries should be unchanged

            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // TAKE effectId should be removed from sagaTakeEffectsWatcher

            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(0);                                                           // sagaEffectIds should still be empty
        });
    });

    describe(`Dispatching of nonexisting action`, () => {
        test(`Using dispatchStartAction()`, () => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            const action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            const testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));
            expect(() => action2PromiseWrapper.dispatchStartAction(store, acDataRequest())).toThrow();
        });

        test(`Using compDispatchStartAction()`, () => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            const action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            const testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));
            expect(() => action2PromiseWrapper.compDispatchStartAction(store.dispatch, acDataRequest())).toThrow();
        });
    });

    describe(`Channel + Fork for special action case`, () => {
        let action2PromiseWrapper: any;
        let testObject: ICreateTestObjectReturnType;
        let prom: Promise<void>;

        beforeAll(() => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

            const sagaTask = initialiseSagaMiddleware.run(watcherSagaChannelAndFork);

            prom = dispatchStartAction(store, acDataRequest());             // special action
            store.dispatch(END);                 // request end

            return sagaTask.toPromise();
        });

        test(`testing interception of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[1];
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(1);
            expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
            expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
        });

        test(`testing resolving of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[2];

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Parent,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of FORK effect (special action case)`, async () => {
            const result = testObject.getTestResults()[3];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            // the following shouldn't change also
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[4];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(2);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0
            expect(parseInt(sagaEffectIds_props[1])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            const expected_sagaEffectIds_property1 = {
                kind: EffectIdKind.Put,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            if (result.sagaEffectIds[sagaEffectIds_props[0]].kind === EffectIdKind.Task) {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property1);
            }
            else {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property1);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property0);
            }

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });

        test(`testing resolving of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[5];

            const expected_actionEntries = {          
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,                    // decremented
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(0);                              // removed entries

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });
 
        test(`testing resolving of returned Promise (special action case)`, async () => {
            return expect(prom).resolves.toBeUndefined();    
        });    
    });

    describe(`Fork for special action case`, () => {
        let action2PromiseWrapper: any;
        let testObject: ICreateTestObjectReturnType;
        let prom: Promise<void>;

        beforeAll(() => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

            const sagaTask = initialiseSagaMiddleware.run(watcherSagaFork);

            prom = dispatchStartAction(store, acDataRequest());             // special action
            store.dispatch(END);                 // request end

            return sagaTask.toPromise();
        });

        test(`testing interception of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[1];
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(1);
            expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
            expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
        });

        test(`testing resolving of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[2];

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Parent,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of FORK effect (special action case)`, async () => {
            const result = testObject.getTestResults()[3];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            // the following shouldn't change also
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[4];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(2);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0
            expect(parseInt(sagaEffectIds_props[1])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            const expected_sagaEffectIds_property1 = {
                kind: EffectIdKind.Put,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            if (result.sagaEffectIds[sagaEffectIds_props[0]].kind === EffectIdKind.Task) {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property1);
            }
            else {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property1);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property0);
            }

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });

        test(`testing resolving of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[5];

            const expected_actionEntries = {          
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,                    // decremented
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(0);                              // removed entries

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });
 
        test(`testing resolving of returned Promise (special action case)`, async () => {
            return expect(prom).resolves.toBeUndefined();    
        });    
    });

//SSSSSSSSSSSSSS

describe(`Fork for special action case when 2 actions dispatched`, () => {
    let action2PromiseWrapper: any;
    let testObject: ICreateTestObjectReturnType;
    let prom1: Promise<void>;
    let prom2: Promise<void>;

    beforeAll(() => {
        // setup
        jest.resetModules();
        const createSagaMiddleware = require('redux-saga').default;
        action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
        action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
        testObject = createTestObject(action2PromiseWrapper);
        const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

        const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

        const sagaTask = initialiseSagaMiddleware.run(watcherSagaFork);

        prom1 = dispatchStartAction(store, acDataRequest());             // special action
        prom2 = dispatchStartAction(store, acDataRequest());             // special action
        store.dispatch(END);                 // request end

        return sagaTask.toPromise();
    });

    test(`testing interception of TAKE effect (special action case)`, async () => {
        const result = testObject.getTestResults()[1];
        const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
        expect(sagaTakeEffectsWatcher_props.length).toBe(1);
        expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
        expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
    });

    test(`testing resolving of TAKE effect (special action case)`, async () => {
        const result = testObject.getTestResults()[2];

        const expected_actionEntries = {
            'REQUEST': {
                type: ActionEntryType.Start,
                refCount: 1,
            },
            'LOADED': {
                type: ActionEntryType.Resolve,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
            'REQUEST_ERROR': {
                type: ActionEntryType.Reject,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
        };

        // check actionEntries
        expect(result.actionEntries).toEqual(expected_actionEntries);

        // check sagaEffectIds
        const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
        expect(sagaEffectIds_props.length).toBe(1);
        expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

        const expected_sagaEffectIds_property0 = {
            kind: EffectIdKind.Parent,
            parentEffectId: expect.any(Number),
            resolve: expect.any(Function),
            reject: expect.any(Function),
            startActionType: 'REQUEST'
        }

        expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

        const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
        expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
    });

    test(`testing interception of FORK effect (special action case)`, async () => {
        const result = testObject.getTestResults()[3];

        const expected_actionEntries = {          // this shouldn't change
            'REQUEST': {
                type: ActionEntryType.Start,
                refCount: 1,
            },
            'LOADED': {
                type: ActionEntryType.Resolve,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
            'REQUEST_ERROR': {
                type: ActionEntryType.Reject,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
        };

        // check actionEntries
        expect(result.actionEntries).toEqual(expected_actionEntries);

        // check sagaEffectIds
        const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
        expect(sagaEffectIds_props.length).toBe(1);
        expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

        const expected_sagaEffectIds_property0 = {
            kind: EffectIdKind.Task,
            parentEffectId: expect.any(Number),
            resolve: expect.any(Function),
            reject: expect.any(Function),
            startActionType: 'REQUEST'
        }

        expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

        // the following shouldn't change also
        const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
        expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
    });

    test(`testing interception of PUT effect (special action case)`, async () => {
        const result = testObject.getTestResults()[4];

        const expected_actionEntries = {          // this shouldn't change
            'REQUEST': {
                type: ActionEntryType.Start,
                refCount: 1,
            },
            'LOADED': {
                type: ActionEntryType.Resolve,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
            'REQUEST_ERROR': {
                type: ActionEntryType.Reject,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
        };

        // check actionEntries
        expect(result.actionEntries).toEqual(expected_actionEntries);

        // check sagaEffectIds
        const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
        expect(sagaEffectIds_props.length).toBe(2);
        expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0
        expect(parseInt(sagaEffectIds_props[1])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

        const expected_sagaEffectIds_property0 = {
            kind: EffectIdKind.Task,
            parentEffectId: expect.any(Number),
            resolve: expect.any(Function),
            reject: expect.any(Function),
            startActionType: 'REQUEST'
        }

        const expected_sagaEffectIds_property1 = {
            kind: EffectIdKind.Put,
            parentEffectId: expect.any(Number),
            resolve: expect.any(Function),
            reject: expect.any(Function),
            startActionType: 'REQUEST'
        }

        if (result.sagaEffectIds[sagaEffectIds_props[0]].kind === EffectIdKind.Task) {
            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);
            expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property1);
        }
        else {
            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property1);
            expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property0);
        }

        // note: do not test sagaTakeEffectsWatcher because we are on another thread
    });

    test(`testing resolving of PUT effect (special action case)`, async () => {
        const result = testObject.getTestResults()[5];

        const expected_actionEntries = {          
            'REQUEST': {
                type: ActionEntryType.Start,
                refCount: 0,                    // decremented
            },
            'LOADED': {
                type: ActionEntryType.Resolve,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
            'REQUEST_ERROR': {
                type: ActionEntryType.Reject,

                startActionTypes: {
                    ['REQUEST']: null,
                }
            },
        };

        // check actionEntries
        expect(result.actionEntries).toEqual(expected_actionEntries);

        // check sagaEffectIds
        const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
        expect(sagaEffectIds_props.length).toBe(0);                              // removed entries

        // note: do not test sagaTakeEffectsWatcher because we are on another thread
    });

    test(`testing resolving of returned Promise1 (special action case)`, async () => {
        return expect(prom1).resolves.toBeUndefined();    
    });    

    test(`testing resolving of returned Promise2 (special action case)`, async () => {
        return expect(prom2).resolves.toBeUndefined();    
    });    
});

//EEEEEEEEEEEEEE

    describe(`Fork for special action case with failure`, () => {
        let action2PromiseWrapper: any;
        let testObject: ICreateTestObjectReturnType;
        let prom: Promise<void>;

        beforeAll(() => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

            const sagaTask = initialiseSagaMiddleware.run(watcherSagaForkWithFailure);

            prom = dispatchStartAction(store, acDataRequest());             // special action
            store.dispatch(END);                 // request end

            return sagaTask.toPromise();
        });

        test(`testing interception of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[1];
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(1);
            expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
            expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
        });

        test(`testing resolving of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[2];

            const expected_actionEntries = {
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Parent,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of FORK effect (special action case)`, async () => {
            const result = testObject.getTestResults()[3];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            // the following shouldn't change also
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[4];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(2);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0
            expect(parseInt(sagaEffectIds_props[1])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            const expected_sagaEffectIds_property1 = {
                kind: EffectIdKind.Put,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            if (result.sagaEffectIds[sagaEffectIds_props[0]].kind === EffectIdKind.Task) {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property1);
            }
            else {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property1);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property0);
            }

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });

        test(`testing resolving of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[5];

            const expected_actionEntries = {          
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,                    // decremented
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(0);                              // removed entries

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });
 
        test(`testing resolving of returned Promise (special action case)`, async () => {
            return expect(prom).rejects.toBeUndefined();    
        });    
    }); 


    describe(`Channel + Call for special action case`, () => {
        let action2PromiseWrapper: any;
        let testObject: ICreateTestObjectReturnType;
        let prom: Promise<void>;

        beforeAll(() => {
            // setup
            jest.resetModules();
            const createSagaMiddleware = require('redux-saga').default;
            action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);
            action2PromiseWrapper.registerActions({ start: "REQUEST", resolve: "LOADED", reject: "REQUEST_ERROR" });
            testObject = createTestObject(action2PromiseWrapper);
            const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware({ sagaMonitor: testObject.getMonitor() });

            const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

            const sagaTask = initialiseSagaMiddleware.run(watcherSagaChannelAndCall); 

            prom = dispatchStartAction(store, acDataRequest());             // special action
            store.dispatch(END);                 // request end

            return sagaTask.toPromise();
        });

        test(`testing interception of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[1];
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(1);
            expect(parseInt(sagaTakeEffectsWatcher_props[0])).toBeGreaterThan(0);                                // name of the property (effectId) should be number > 0
            expect(result.sagaTakeEffectsWatcher[sagaTakeEffectsWatcher_props[0]]).toBeGreaterThan(0);   // parrentEffectId should be number > 0
        });

        test(`testing resolving of TAKE effect (special action case)`, async () => {
            const result = testObject.getTestResults()[2];

            const expected_actionEntries = { 
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Parent,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of CALL effect (special action case)`, async () => {
            const result = testObject.getTestResults()[3];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(1);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);

            // the following shouldn't change also
            const sagaTakeEffectsWatcher_props = Object.keys(result.sagaTakeEffectsWatcher);
            expect(sagaTakeEffectsWatcher_props.length).toBe(0);                                                  // should be zero because it should be deleted
        });

        test(`testing interception of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[4];

            const expected_actionEntries = {          // this shouldn't change
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 1,
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(2);
            expect(parseInt(sagaEffectIds_props[0])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0
            expect(parseInt(sagaEffectIds_props[1])).toBeGreaterThan(0);             // name of the property (effectId) should be number > 0

            const expected_sagaEffectIds_property0 = {
                kind: EffectIdKind.Task,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            const expected_sagaEffectIds_property1 = {
                kind: EffectIdKind.Put,
                parentEffectId: expect.any(Number),
                resolve: expect.any(Function),
                reject: expect.any(Function),
                startActionType: 'REQUEST'
            }

            if (result.sagaEffectIds[sagaEffectIds_props[0]].kind === EffectIdKind.Task) {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property0);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property1);
            }
            else {
                expect(result.sagaEffectIds[sagaEffectIds_props[0]]).toEqual(expected_sagaEffectIds_property1);
                expect(result.sagaEffectIds[sagaEffectIds_props[1]]).toEqual(expected_sagaEffectIds_property0);
            }

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });

        test(`testing resolving of PUT effect (special action case)`, async () => {
            const result = testObject.getTestResults()[5];

            const expected_actionEntries = {          
                'REQUEST': {
                    type: ActionEntryType.Start,
                    refCount: 0,                    // decremented
                },
                'LOADED': {
                    type: ActionEntryType.Resolve,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
                'REQUEST_ERROR': {
                    type: ActionEntryType.Reject,

                    startActionTypes: {
                        ['REQUEST']: null,
                    }
                },
            };

            // check actionEntries
            expect(result.actionEntries).toEqual(expected_actionEntries);

            // check sagaEffectIds
            const sagaEffectIds_props = Object.keys(result.sagaEffectIds);
            expect(sagaEffectIds_props.length).toBe(0);                              // removed entries

            // note: do not test sagaTakeEffectsWatcher because we are on another thread
        });
 
        test(`testing resolving of returned Promise (special action case)`, async () => {
            return expect(prom).resolves.toBeUndefined();    
        });    
    });
}); 



