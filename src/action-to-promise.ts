// TODO
//     const actionEntries: IActionEntries = {};
// const sagaTakeEffectsWatcher: ISagaTakeEffectWatcher = {};
// const sagaEffectIds: ISagaEffectIds = {};

// 1. implement registerActions(start_action_type, resolve_action_type, reject_action_type)
//    - registers actions for SagaMonitor subroutines; create the following entries:
//      actionEntries = 
//      {
//          ... 
//          [actionType_start]: {
//               type: 0,                    // either 0-start, 1-resolve, 2-reject     
//               refCount?: 0,               // reference count
//          },
//          [actionType_resolve]: {
//              type: 1,                    
//              startActionTypes?: {
//                  ...     
//                  <actionType_start>: null        // start_action_type (only for resolve_action_type & reject_action_type)
//                  ...
//              }
//          },
//          [actionType_reject]: {
//              type: 2,                    
//              startActionTypes?: {
//                  ...    
//                  <actionType_start>: null       // start_action_type (only for resolve_action_type & reject_action_type)
//                  ...
//              }
//          },
//           ...
//       }
//
// 2. implement SagaMonitor subroutines & effectMiddleware() function
//     - intercept every effectTriggered with TAKE type; store 'parentEffectId' under 'effectId' property:
//       sagaTakeEffectsWatcher =
//       {
//           ...    
//           [effectId]: parentEffectId
//           ... 
//       }
//
//     - intercept every effectResolved with 'effectId' stored in sagaTakeEffectsWatcher; the result is an action
//       check if we registered given action type; if yes then:
//       * increment the action 'refCount' property for action in actionEntries 
//       * add property 'parentEffectId' to sagaEffectIds as parent effectId and resolve, reject properties extracted from the action and 'startActionType=actionType_start' 
//       * remove entry for effectId from watcher object
//       actionEntries = 
//       {
//           [actionType_start]: {
//               type: 0,                                  // either 0-start, 1-resolve, 2-reject     
//               refCount: N,                              <==== increment
//           }
//       }
//       sagaEffectIds = 
//       {
//           ...    
//           [parentEffectId]: {                           <==== add it
//               kind: 0,   // 0 - parent effectId, 1 - task effectId, 2 - put effectId
//               parentEffectId: <value>,
//               resolve: <from the action>,
//               reject: <from the action>,
//               startActionType: <value>
//           }
//           ...
//       } 
//       sagaTakeEffectsWatcher =
//       {
//           ...    
//           [effectId]: parentEffectId                    <==== remove it
//           ...
//       }
//     - intercept effectTriggered with CALL or FORK type and 'parentEffectId' equal to stored 'parentEffectId'
//       if entry exists for 'parentEffectId' in sagaEffectIds with 'kind===Parent'
//       * add 'effectId' as task effectId to sagaEffectIds with properties resolve, reject, startActionType copied from 'parentEffectId' in sagaEffectIds
//       * delete 'parentEffectId' property from sagaEffectIds
//       sagaEffectIds = 
//       {
//           [parentEffectId]: {                                                           <==== delete it
//               kind: 0,   // 0 - parent effectId, 1 - task effectId, 2 - put effectId
//               parentEffectId: <value>,
//               resolve: <from the action>,
//               reject: <from the action>,
//               startActionType: <value>
//           }
//           [effectId]: {                                                                 <==== add it
//               kind: 1,            // task    
//               parentEffectId: parentEffectId,
//               resolve: <copied from 'parentEffectId'>,
//               reject:  <copied from 'parentEffectId'>,
//               startActionType: <copied from 'parentEffectId'>
//           }
//       } 
//     - wait for effectTriggered of type PUT and parentEffectId===<task effectId>
//       if entry exists for 'parentEffectId' in sagaEffectIds with 'kind===Task'
//       * add 'effectId' as put effectId with reject, resolve & startActionType copied from 'parentEffectId' in sagaEffectIds
//       sagaEffectIds = 
//       {
//           [effectId]: {                  
//               kind: 1,            // task    
//               parentEffectId: <value>,
//               resolve: <copied from 'parentEffectId'>,
//               reject:  <copied from 'parentEffectId'>,
//               startActionType: <copied from 'parentEffectId'>
//           }
//           [effectId2]: {                   <==== add it
//               kind: 2,            // put
//               parentEffectId: effectId,
//               resolve: <copied from 'effectId'>,
//               reject:  <copied from 'effectId'>,
//               startActionType: <copied from 'effectId'>
//           }
//       }
//     - wait for effectResolved with 'effectId'===<put effectId>
//       * if the resulting action type is resolve_action or reject_action associated with current start_action
//       *   decrement action_type_start 'refCount' in ActionEntries
//       *   delete parent effectId of put effectId from sagaEffectIds
//       *   delete put effectId from sagaEffectIds
//       *   either call Promise resolve or reject depending on resulting action type
//       * else
//       *   delete put effectId from sagaEffectIds
//       actionEntries = 
//       {
//           [actionType_start]: {
//               type: 0,                                  // either 0-start, 1-resolve, 2-reject     
//               refCount: M,                              <==== decrement
//           }
//       }
//       sagaEffectIds = 
//       {
//           [effectId]: {                  
//               kind: 1,            // task               <==== delete it
//               parentEffectId: <value>,
//               resolve: <copied from 'parentEffectId'>,
//               reject:  <copied from 'parentEffectId'>,
//               startActionType: <copied from 'parentEffectId'>
//           }
//           [effectId2]: {                                <==== delete it
//               kind: 2,            // put
//               parentEffectId: effectId,
//               resolve: <copied from 'effectId'>,
//               reject:  <copied from 'effectId'>,
//               startActionType: <copied from 'effectId'>
//           }
//       }
//
// 3. implement dispatchStart(start_action): Promise<void>
//    - creates Promise
//    - dispatches start_action with modified payload containing resolve & reject of the Promise
//    - returns the Promise
// 
// 4. override createSagaMiddleware()
//
import { take, call, fork, put, SimpleEffect } from "redux-saga/effects";
import { Action, Store, AnyAction } from 'redux';

export interface IActionTriple {
    start: string;
    resolve: string;
    reject: string;
}

export enum ActionEntryType {
    Start = 0,
    Resolve = 1,
    Reject = 2
}

export interface ISagaTakeEffectWatcher {
    [effectId: string]: number;
}

export interface IStartActionTypes {
    [actionType: string]: null;
}

/**
 * Action entry object.
 */
export interface IActionEntry {
    type: ActionEntryType;
    refCount?: number;                           // only for 'Start' type
    startActionTypes?: IStartActionTypes;        // only for non-'Start' type 
}

export enum EffectIdKind {
    Parent = 0,
    Task = 1,
    Put = 2
}

export interface ISagaEffectId {
    kind: EffectIdKind;
    parentEffectId: number,
    resolve: any;
    reject: any;
    startActionType: string;
}

export interface ISagaEffectIds {
    [index: string]: ISagaEffectId;
}

export interface IA2PAction {
    type: string;
    resolve: any;
    reject: any
    payload: AnyAction;
}

/**
 * Object mapping action types (property name) to IActionEntry object
 */
export interface IActionEntries {
    [action_type: string]: IActionEntry;
}

export const actionToPromiseAction = (action: AnyAction, resolve: any, reject: any): IA2PAction => {
    return { type: action.type, payload: { ...action }, reject, resolve };
}

export const actionFromPromiseAction = (action: AnyAction): AnyAction => {
    if ((typeof action.resolve !== 'undefined') && (typeof action.reject !== 'undefined')) {
        const action2: IA2PAction = action as IA2PAction;
        return action2.payload;
    }
    else {
        return action;
    }
}

/**
 * Function dispatches passed action to given store .
 * 
 * @param store - redux store
 * @param action - redux action object
 * @deprecated since version 1.4.0; use IAction2PromiseWrapper.dispatchStartAction instead
 */
export const dispatchStartAction = (store: Store, action: AnyAction): Promise<void> =>
    new Promise(
        (resolve, reject) => {
            // this dispatches start action with transformed payload
            store.dispatch(actionToPromiseAction(action, resolve, reject));
        }
    );

/**
 * Function dispatches given action using passed dispatch function.
 * 
 * @param dispatch - bound to store dispatch function
 * @param action - redux action object
 * @deprecated since version 1.4.0; use IAction2PromiseWrapper.compDispatchStartAction instead
 */
export const compDispatchStartAction = (dispatch: (action: AnyAction) => AnyAction, action: AnyAction): Promise<void> =>
    new Promise(
        (resolve, reject) => {
            // this dispatches start action with transformed payload
            dispatch(actionToPromiseAction(action, resolve, reject));
        }
    );

export interface ITestObject {
    getActionEntries: () => IActionEntries;
    getSagaTakeEffectsWatcher: () => ISagaTakeEffectWatcher;
    getSagaEffectIds: () => ISagaEffectIds;
    resetActionEntries: () => void;
    resetSagaTakeEffectsWatcher: () => void;
    resetSagaEffectIds: () => void;
}

export interface IAction2PromiseWrapper {
    createSagaMiddleware: (options?: any) => any;
    registerActions: (actions: IActionTriple) => void;
    testObject: ITestObject;
    dispatchStartAction: (store: Store, action: AnyAction) => Promise<void>;
    compDispatchStartAction: (dispatch: (action: AnyAction) => AnyAction, action: AnyAction) => Promise<void>
}

export function createAction2PromiseWrapper(orgCreateSagaMiddleware: any): IAction2PromiseWrapper {
    const actionEntries: IActionEntries = {};
    const sagaTakeEffectsWatcher: ISagaTakeEffectWatcher = {};
    const sagaEffectIds: ISagaEffectIds = {};

    const createSagaMiddleware = (options?: any): any => {
        const effectTriggeredHandler = ({ effectId, parentEffectId, label, effect }: { effectId: number; parentEffectId: number; label: string; effect: any }) => {
            //console.log(`effectTriggeredHandler={{effectId=${effectId}, parentEffectId=${parentEffectId}, label=${parentEffectId}, effect=${JSON.stringify(effect)}}}`);
            const currEffect = <SimpleEffect<string, any>>effect;

            if (currEffect.type === take().type) {
                sagaTakeEffectsWatcher[effectId] = parentEffectId;
            }
            else if ((currEffect.type === fork(() => { }).type) || (currEffect.type === call(() => { }).type)) {
                if (typeof sagaEffectIds[parentEffectId] !== 'undefined') {
                    const parentSagaEffectId = sagaEffectIds[parentEffectId];

                    if (parentSagaEffectId.kind === EffectIdKind.Parent) {
                        // add parentEffectId to sagaEffectIds
                        sagaEffectIds[effectId] = {
                            kind: EffectIdKind.Task,
                            parentEffectId: parentEffectId,
                            resolve: parentSagaEffectId.resolve,
                            reject: parentSagaEffectId.reject,
                            startActionType: parentSagaEffectId.startActionType
                        };

                        //console.log(`FORK triggered; added to sagaEffectIds => sagaEffectIds[${effectId}]=${JSON.stringify(sagaEffectIds[effectId])}`);

                        // delete parent effectId entry
                        delete sagaEffectIds[parentEffectId];
                    }
                }
            }
            else if (currEffect.type === put({ type: '' }).type) {
                if (typeof sagaEffectIds[parentEffectId] !== 'undefined') {
                    const parentSagaEffectId = sagaEffectIds[parentEffectId];

                    if (parentSagaEffectId.kind === EffectIdKind.Task) {
                        // add parentEffectId to sagaEffectIds
                        sagaEffectIds[effectId] = {
                            kind: EffectIdKind.Put,
                            parentEffectId: parentEffectId,
                            resolve: parentSagaEffectId.resolve,
                            reject: parentSagaEffectId.reject,
                            startActionType: parentSagaEffectId.startActionType
                        };

                        //console.log(`PUT triggered; added to sagaEffectIds => sagaEffectIds[${effectId}]=${JSON.stringify(sagaEffectIds[effectId])}`);
                    }
                }
            }
        };

        const effectResolvedHandler = (effectId: number, result: any) => {
            //console.log(`effectTriggeredHandler={{effectId=${effectId}, result=${JSON.stringify(result)}}}`);

            // check if there's an entry in sagaTakeEffectsWatcher
            if (typeof sagaTakeEffectsWatcher[effectId] !== 'undefined') {
                // so it is TAKE effect resolved
                const parentEffectId = sagaTakeEffectsWatcher[effectId];

                // now check if the action type is registered
                if (typeof actionEntries[result.type] !== 'undefined') {
                    const action = result as IA2PAction;

                    // check if it is a special action (with properties: reject & resolve)
                    if ((typeof action.resolve !== 'undefined') && (typeof action.reject !== 'undefined')) {
                        const actionEntry = actionEntries[result.type];

                        // increment actionEntry.refCount (the beginning of processing)
                        if (typeof actionEntry.refCount !== 'undefined') actionEntry.refCount++;

                        // add parentEffectId to sagaEffectIds
                        sagaEffectIds[parentEffectId] = {
                            kind: EffectIdKind.Parent,
                            parentEffectId: 0,
                            resolve: action.resolve,
                            reject: action.reject,
                            startActionType: result.type
                        };

                        //console.log(`effectResolvedHandler: TAKE effect resolved; added to sagaEffectIds => sagaEffectIds[${parentEffectId}]=${JSON.stringify(sagaEffectIds[parentEffectId])}`);
                    }
                }

                delete sagaTakeEffectsWatcher[effectId];             // remove TAKE effectId from sagaTakeEffectsWatcher
            }
            // check if there's an entry in sagaEffectIds for effectId with 'kind===Put'
            else if (typeof sagaEffectIds[effectId] !== 'undefined') {
                const sagaEffectId = sagaEffectIds[effectId];

                if (sagaEffectId.kind === EffectIdKind.Put) {
                    if (typeof actionEntries[result.type] !== 'undefined') { // there is such action registered
                        const actionEntry = actionEntries[sagaEffectId.startActionType];

                        const terminateActon = actionEntries[result.type];

                        if (typeof terminateActon.startActionTypes !== 'undefined') {
                            if (typeof terminateActon.startActionTypes[sagaEffectId.startActionType] !== 'undefined') { // check if terminateAction is associated with startAction
                                if (terminateActon.type === ActionEntryType.Resolve) {
                                    //console.log(`effectResolvedHandler: PUT effect resolved; resolve`);

                                    if (typeof actionEntry.refCount !== 'undefined') actionEntry.refCount--;
                                    const resolve = sagaEffectId.resolve;
                                    delete sagaEffectIds[sagaEffectId.parentEffectId];
                                    delete sagaEffectIds[effectId];
                                    resolve();
                                }
                                else if (terminateActon.type === ActionEntryType.Reject) {
                                    //console.log(`effectResolvedHandler: PUT effect resolved; reject`);

                                    if (typeof actionEntry.refCount !== 'undefined') actionEntry.refCount--;
                                    const reject = sagaEffectId.reject;
                                    delete sagaEffectIds[sagaEffectId.parentEffectId];
                                    delete sagaEffectIds[effectId];
                                    reject();
                                }
                            }
                        }
                    }
                }
            }
        };

        const effectRejectedHandler = (effectId: number, error: any) => {
        };

        const effectCancelledHandler = (effectId: number) => {
        };

        const actionDispatchedHandler = (action: Action) => {
        };

        const newMonitor = {
            effectTriggered: ({ effectId, parentEffectId, label, effect }: { effectId: number; parentEffectId: number; label: string; effect: any }) => {
                effectTriggeredHandler({ effectId, parentEffectId, label, effect });
                if (options && options.sagaMonitor && options.sagaMonitor.effectTriggered) options.sagaMonitor.effectTriggered({ effectId, parentEffectId, label, effect });
            },
            effectResolved: (effectId: number, result: any) => {
                effectResolvedHandler(effectId, result);
                if (options && options.sagaMonitor && options.sagaMonitor.effectResolved) options.sagaMonitor.effectResolved(effectId, result);
            },
            effectRejected: (effectId: number, error: any) => {
                effectRejectedHandler(effectId, error);
                if (options && options.sagaMonitor && options.sagaMonitor.effectRejected) options.sagaMonitor.effectRejected(effectId, error);
            },
            effectCancelled: (effectId: number) => {
                effectCancelledHandler(effectId);
                if (options && options.sagaMonitor && options.sagaMonitor.effectCancelled) options.sagaMonitor.effectCancelled(effectId);
            },
            actionDispatched: (action: Action) => {
                actionDispatchedHandler(action);
                if (options && options.sagaMonitor && options.sagaMonitor.actionDispatched) options.sagaMonitor.actionDispatched(action);
            }
        }

        /*        
                const effectMiddleware = next => effect => {
                    // TODO
                    //    if (effect === apiCall) {
                    //      Promise.resolve().then(() => next('injected value'));
                    //      return;
                    //    }
                    return next(effect);
                };
        */
        const orgEffectMiddlewares = (options && options.effectMiddlewares) ? [...options.effectMiddlewares] : [];
        //const newEffectMiddlewares = [effectMiddleware, ...orgEffectMiddlewares];

        const newEffectMiddlewares = [...orgEffectMiddlewares]

        const newOptions = {
            ...options, sagaMonitor: newMonitor, effectMiddlewares: newEffectMiddlewares
        }

        return orgCreateSagaMiddleware(newOptions);
    }

    const registerActions = (actions: IActionTriple): void => {
        if (typeof actionEntries[actions.start] === 'undefined') {
            actionEntries[actions.start] = {
                type: ActionEntryType.Start,
                refCount: 0
            };

            if (typeof actionEntries[actions.resolve] === 'undefined') {
                actionEntries[actions.resolve] = {
                    type: ActionEntryType.Resolve,
                    startActionTypes: {}
                };
            }

            if ((typeof actionEntries[actions.resolve] !== 'undefined')) {
                const o = actionEntries[actions.resolve];

                if (typeof o.startActionTypes !== 'undefined') {
                    o.startActionTypes[actions.start] = null;
                }
            }

            if (typeof actionEntries[actions.reject] === 'undefined') {
                actionEntries[actions.reject] = {
                    type: ActionEntryType.Reject,
                    startActionTypes: {}
                };
            }

            if ((typeof actionEntries[actions.reject] !== 'undefined')) {
                const o = actionEntries[actions.reject];

                if (typeof o.startActionTypes !== 'undefined') {
                    o.startActionTypes[actions.start] = null;
                }
            }
        }
        else
            throw new Error("Cannot register start action: it is already registered");
    }


    /**
     * Function dispatches passed action to given store .
     * 
     * @param store - redux store
     * @param action - redux action object
     */
    const dispatchStartAction = (store: Store, action: AnyAction): Promise<void> => {
        // check if start action is registered
        if (typeof actionEntries[action.type] === 'undefined') {
            throw new Error(`The start action type ${action.type} is not registered, call registerActions() first`);
        }

        return new Promise(
            (resolve, reject) => {
                // this dispatches start action with transformed payload
                store.dispatch(actionToPromiseAction(action, resolve, reject));
            }
        );
    };

    /**
     * Function dispatches given action using passed dispatch function.
     * 
     * @param dispatch - bound to store dispatch function
     * @param action - redux action object
     */
    const compDispatchStartAction = (dispatch: (action: AnyAction) => AnyAction, action: AnyAction): Promise<void> => {
        // check if start action is registered
        if (typeof actionEntries[action.type] === 'undefined') {
            throw new Error(`The start action type ${action.type} is not registered, call registerActions() first`);
        }

        return new Promise(
            (resolve, reject) => {
                // this dispatches start action with transformed payload
                dispatch(actionToPromiseAction(action, resolve, reject));
            }
        );
    };


    // for testing only
    const getActionEntries = () => actionEntries;
    const getSagaTakeEffectsWatcher = () => sagaTakeEffectsWatcher;
    const getSagaEffectIds = () => sagaEffectIds;

    interface IObject {
        [name: string]: any;
    }

    const deleteProperties = (o: IObject): void => {
        for (var key in o) {
            if (o.hasOwnProperty(key)) {
                delete o[key];
            }
        }
    }

    const resetActionEntries = () => {
        deleteProperties(actionEntries);
    };

    const resetSagaTakeEffectsWatcher = () => {
        deleteProperties(sagaTakeEffectsWatcher);
    };

    const resetSagaEffectIds = () => {
        deleteProperties(sagaEffectIds);
    };

    const testObject = {
        getActionEntries,
        getSagaTakeEffectsWatcher,
        getSagaEffectIds,
        resetActionEntries,
        resetSagaTakeEffectsWatcher,
        resetSagaEffectIds
    };

    return { createSagaMiddleware, registerActions, testObject, dispatchStartAction, compDispatchStartAction };
}

