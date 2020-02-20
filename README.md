# action-to-promise
Utility converting action to Promise in redux-saga environment

# What it does
It dispatches modified redux action to a store using helper function which in turn returns a Promise which will be resolved 
or rejected when corresponding associated action either on success or error will be PUT-ted by redux-saga.

# How it works
Function 
```javascript
dispatchStartAction(store: Store, action: AnyAction) => Promise<void> 
```
creates a new action and dispatches it to redux store
```javascript
{ 
    type: <original_action_type>, 
    resolve: <promise_executor_resolve>, 
    reject: <promise_executor_reject>, 
    payload: <original_action> 
}
```
where **payload** property contains original action, **type** property repeats original action type and **resolve**, **reject** properties 
were passed to the executor of the returned Promise.

Then SagaMonitor object intercepts and traces saga effects using unique identifiers & parent-child relations. 
When either success or error action are dispatched (PUT) to the store then the Promise is either resolved or rejected.

# How to use it

to install:
```javascript
npm install action-to-promise
```

in code:
```javascript
import createSagaMiddleware from "redux-saga";
import { createAction2PromiseWrapper } from 'action-to-promise';

...
// creating redux store
const action2PromiseWrapper = createAction2PromiseWrapper(createSagaMiddleware);  // pass Saga createSagaMiddleware function as parameter

// register observed action types: start_action_type, resolve_action_type, reject_action_type
action2PromiseWrapper.registerActions({ start: start_action_type1, resolve: resolve_action_type1, reject: reject_action_type1 });
action2PromiseWrapper.registerActions({ start: start_action_type2, resolve: resolve_action_type2, reject: reject_action_type2 });
...

// use wrapper function to call original Saga createSagaMiddleware()
const initialiseSagaMiddleware = action2PromiseWrapper.createSagaMiddleware();

export const store = createStore(reducerRoot, storeEnhancers(applyMiddleware(initialiseSagaMiddleware)));

initialiseSagaMiddleware.run(watcherSaga);
```

```javascript
// dispatching action transformed to Promise
import { dispatchStartAction } from 'action-to-promise';
import { store } from '../redux/store';

...
function loadMoreRows(limit, offset) {
    return dispatchStartAction(store, start_action_creator(limit, offset));
}
...
```

# Handled Saga scenarios
```javascript
// common worker Saga
function* workerSaga(action) {
    try {
        ...
        yield put(resolve_action);
    } catch (e) {
        yield put(reject_action);
    }
}
```

```javascript
// action channel is used and then FORK effect
function* watcherSaga() {
    const actChan = yield actionChannel(start_action_type);

    while (true) {
        const action = yield take(actChan);
        const org_action = actionFromPromiseAction(action);  <=== important: function restores original action
        yield fork(workerSaga, org_action);
    }
}
```

```javascript
// actions are retrieved directly then FORK effect is used
function* watcher() {
    while (true) {
        const action = yield take(start_action_type);
        const org_action = actionFromPromiseAction(action);  <=== important: function restores original action
        yield fork(workerSaga, org_action);
    }
}
```

```javascript
// action channel is used and then CALL effect
function* watcherSaga() {
    const actChan = yield actionChannel(start_action_type);

    while (true) {
        const action = yield take(actChan);
        const org_action = actionFromPromiseAction(action);  <=== important: function restores original action
        yield call(workerSaga, org_action);
    }
}
```

```javascript
// actions are retrieved directly then CALL effect is used
function* watcherSaga() {
    while (true) {
        const action = yield take(start_action_type);
        const org_action = actionFromPromiseAction(action);  <=== important: function restores original action
        yield call(workerSaga, org_action);
    }
}
```

# API

```javascript
export interface IActionTriple {
    start: string;
    resolve: string;
    reject: string;
}

interface IAction2PromiseWrapper {
    createSagaMiddleware: (options?: any) => any; 
    registerActions: (actions: IActionTriple) => void; 
}  
```

#### `function createAction2PromiseWrapper(orgCreateSagaMiddleware: any): IAction2PromiseWrapper`

Function creates main object with helper methods as properties. These methods are used to register observed actions 
and to create wrapper Saga `createSagaMiddleware` function.

#### `<action2promisewrapper>.registerActions(actions: IActionTriple) => void`

Function registers triple of associated action types:
* start - action type that begins the sequence
* resolve - action type that resolves the Promise
* reject - action type that rejects the Promise

#### `<action2promisewrapper>.createSagaMiddleware(options?: any) => any`

Function calls original Saga createSagaMiddleware with own `options` object. It supplies `effectTriggered`. `effectResolved`,
`effectRejected`, `effectCancelled`, `actionDispatched` handlers that finally call original methods if any passed as properties 
of `options`.

```javascript
interface IA2PAction {
    type: string;
    resolve: any;
    reject: any
    payload: AnyAction;
}
```

#### `<action2promisewrapper>.dispatchStartAction(store: Store, action: AnyAction) => Promise<void>`

Function dispatches action to the store calling 'dispatch' method of the store. It returns promise that will be resolved or rejected
depending on action (either resolve or reject) PUT'ed to the store.
Note: this method throws and exception if `action` type is not registered

#### `<action2promisewrapper>.compDispatchStartAction(dispatch: (action: AnyAction) => AnyAction, action: AnyAction) => Promise<void>`

Function dispatches action to store calling 'dispatch' method bound to that store. It returns promise that will be resolved or rejected
depending on action (either resolve or reject) PUT'ed to the store.
Note: this method throws and exception if `action` type is not registered

#### `dispatchStartAction(store: Store, action: AnyAction) => Promise<void>`

Function dispatches action to the store calling 'dispatch' method of the store. It returns promise that will be resolved or rejected
depending on action (either resolve or reject) PUT'ed to the store.
Note: this function is deprecated, use `<action2promisewrapper>.dispatchStartAction(...)` instead

#### `compDispatchStartAction(dispatch: (action: AnyAction) => AnyAction, action: AnyAction) => Promise<void>`

Function dispatches action to store calling 'dispatch' method bound to that store. It returns promise that will be resolved or rejected
depending on action (either resolve or reject) PUT'ed to the store.
Note: this function is deprecated, use `<action2promisewrapper>.compDispatchStartAction(...)` instead

#### `actionFromPromiseAction(action: AnyAction) => AnyAction`

Function usually called in Saga generator function to restore original action without `resolve` and `reject` properties.
If `resolve` or `reject` is missing then it returns passed as parameter action.
