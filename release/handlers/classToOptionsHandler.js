"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const consts_1 = require("../consts");
const helpers_1 = require("../helpers");
function convertClassToOptions(mainClass) {
    var _a;
    const decoratorExpression = mainClass.getDecorator('Component').getCallExpression();
    //temporary write the props to decoratorObject.
    if (!((_a = decoratorExpression.getArguments()) === null || _a === void 0 ? void 0 : _a.length)) {
        //no argument found -> create new decorator object
        decoratorExpression.addArgument(`{}`);
    }
    const decoratorObject = decoratorExpression.getArguments()[0];
    mapData(decoratorObject, mainClass);
    mapComputed(decoratorObject, mainClass);
    const watchNames = mapWatch(decoratorObject, mainClass);
    mapMethod(decoratorObject, mainClass, watchNames);
    const decoratorProps = decoratorObject === null || decoratorObject === void 0 ? void 0 : decoratorObject.getProperties();
    return decoratorProps;
}
exports.default = convertClassToOptions;
function mapData(decoratorObject, mainClass) {
    var _a, _b;
    const dataDeclares = mainClass.getProperties();
    if (dataDeclares.length == 0)
        return;
    const propsNames = (_b = (_a = decoratorObject.getProperty('props')) === null || _a === void 0 ? void 0 : _a.getInitializer()) === null || _b === void 0 ? void 0 : _b.getProperties().map((p) => p.getName());
    const assigns = [];
    dataDeclares.forEach(p => {
        const name = p.getName();
        //this data is a property -> skip this
        if (propsNames.includes(name))
            return;
        assigns.push({ name, initializer: p.getInitializer().print(), kind: 40, type: p.getChildAtIndex(2).getText() });
    });
    const dataMethod = decoratorObject.addMethod({
        name: 'data',
        statements: [`return {}`],
        returnType: `{${assigns.map(a => `${a.name}: ${a.type}`).join(', ')}}`,
    });
    const dataObject = (0, helpers_1.getReturnedExpression)(dataMethod);
    //add the data to dataPlace in batch
    dataObject.addPropertyAssignments(assigns);
}
function mapComputed(decoratorObject, mainClass) {
    const getAccessors = mainClass.getGetAccessors();
    if (getAccessors.length == 0)
        return;
    const computedObject = decoratorObject.addPropertyAssignment({
        name: 'computed', initializer: `{}`,
    }).getInitializer();
    getAccessors.forEach(computed => {
        var _a;
        const name = computed.getName();
        const type = (_a = computed.getReturnTypeNode()) === null || _a === void 0 ? void 0 : _a.getText();
        //add the computed to computedObject
        computedObject.addMethod({ name }).replaceWithText(`${name} (${(0, helpers_1.getParamsString)(computed)})${type ? `: ${type}` : ''} ${computed.getBody().print()}`);
    });
}
function mapWatch(decoratorObject, mainClass) {
    //Get all method that have @Watch
    const allWatchMethods = mainClass.getDescendantsOfKind(ts_morph_1.ts.SyntaxKind.Decorator)
        .filter((d) => d.getCallExpression().getExpression().print() === 'Watch')
        .map((d) => d.getParent());
    if (allWatchMethods.length == 0)
        return;
    const watchMethods = new Set(allWatchMethods);
    const watchObject = decoratorObject.addPropertyAssignment({
        name: 'watch', initializer: `{}`,
    }).getInitializer();
    const watchNames = [];
    let tmpWatch = [];
    watchMethods.forEach(watch => {
        const allWatchVars = watch.getDecorators().filter(d => d.getCallExpression().getExpression().print() === 'Watch').map(d => d.getCallExpression().getArguments()[0].print());
        const name = allWatchVars.length > 1 ? `[${allWatchVars.join(', ')}]` : allWatchVars[0];
        // const name = (watch.getDecorator('Watch').getCallExpression().getArguments()[0] as StringLiteral).getLiteralText();
        //add the method to watchObject
        watchObject.addMethod({ name }).replaceWithText(`${name} (${(0, helpers_1.getParamsString)(watch)}) ${watch.getBody().print()}`);
        watchNames.push(watch.getName());
    });
    return watchNames;
}
function mapMethod(decoratorObject, mainClass, watchNames) {
    const methods = mainClass.getMethods().filter(m => !watchNames.includes(m.getName()));
    const realMethods = [];
    const methodNames = [];
    methods.forEach((m) => {
        const name = m.getName();
        //hooks will have to be a new prop. Cannot declare in methods
        if (consts_1.AVAILABLE_HOOKS.find((h) => h.toLowerCase() === name) || name === 'created') {
            createHook(m, decoratorObject);
            return;
        }
        realMethods.push(m.print());
        methodNames.push(name);
    });
    if (realMethods.length == 0)
        return;
    const methodsObject = decoratorObject.addPropertyAssignment({
        name: 'methods', initializer: `{}`,
    }).getInitializer();
    methodNames.forEach((name, index) => {
        methodsObject.addMethod({ name }).replaceWithText(realMethods[index]);
    });
}
function createHook(hookData, decoratorObject) {
    decoratorObject.addMethod({ name: hookData.getName(), }).replaceWithText(hookData.print());
}
//# sourceMappingURL=classToOptionsHandler.js.map