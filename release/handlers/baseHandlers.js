"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const ts_morph_2 = require("ts-morph");
const consts_1 = require("../consts");
const helpers_1 = require("../helpers");
const mapperModel_1 = require("../models/mapperModel");
const computedHandlers_1 = require("./computedHandlers");
const mixinsHandler_1 = require("./mixinsHandler");
const hooksHandler_1 = __importDefault(require("./hooksHandler"));
const classToOptionsHandler_1 = __importDefault(require("./classToOptionsHandler"));
function makeVue3CodeFromVue2Export(inputSource, outputFile) {
    var _a;
    //prepare template object
    const inputObjectNode = (_a = (0, helpers_1.findExportNode)(inputSource)) === null || _a === void 0 ? void 0 : _a.getExpression();
    //copy import to template object
    const imports = inputSource.getChildrenOfKind(ts_morph_1.ts.SyntaxKind.ImportDeclaration);
    imports.forEach(imp => outputFile.addImportDeclaration({ moduleSpecifier: "" }).replaceWithText(imp.print()));
    let inputProperties = [];
    const inputMapper = new mapperModel_1.InputMapper();
    if (inputObjectNode === null || inputObjectNode === void 0 ? void 0 : inputObjectNode.getProperties) {
        //the input file is option API
        inputProperties = inputObjectNode.getProperties();
    }
    else {
        //try to read file as class component
        const mainClass = inputSource.getFirstChildByKind(ts_morph_1.ts.SyntaxKind.ClassDeclaration);
        if (!mainClass)
            throw `ERROR: Input file is not Vue option/class component`;
        inputProperties = (0, classToOptionsHandler_1.default)(mainClass);
    }
    //save only neccessary properties and methods to inputMapper
    inputProperties.forEach(node => {
        let key = node.getName(), value;
        switch (node.getKind()) {
            case ts_morph_1.ts.SyntaxKind.PropertyAssignment:
                value = node.getInitializer();
                break;
            case ts_morph_1.ts.SyntaxKind.MethodDeclaration:
                value = node.getBody();
                break;
            default: throw `'${key}' type is not valid.`;
        }
        if (inputMapper[key])
            inputMapper[key] = value;
    });
    inputMapper.data = (0, helpers_1.getReturnedExpression)(inputMapper.data);
    handleMapping(inputMapper, outputFile);
    return outputFile.print();
}
exports.default = makeVue3CodeFromVue2Export;
//apply the mapping to templateObject
function handleMapping(inputMapper, outputFile) {
    const outputMapper = (0, helpers_1.constructMainOutputMapper)(outputFile);
    console.log(' - handling data, props');
    componentsHandler(inputMapper, outputMapper);
    propsHandler(inputMapper, outputMapper);
    dataHandler(inputMapper, outputMapper);
    console.log(' - handling mixins');
    (0, mixinsHandler_1.mixinsToComposables)(inputMapper, outputMapper);
    console.log(' - handling computed, methods, watch');
    computedHandler(inputMapper, outputMapper);
    methodsHandler(inputMapper, outputMapper);
    watchHandler(inputMapper, outputMapper);
    console.log(' - handling hooks');
    (0, hooksHandler_1.default)(inputMapper, outputMapper);
    setupReturnHandler(inputMapper, outputMapper);
    console.log(' - marking unsure expressions');
    markUnsureExpression(inputMapper, outputMapper);
    //finally add imported functions from vue-composition-api
    outputFile.addImportDeclaration({ moduleSpecifier: "@vue/composition-api", namedImports: outputMapper.newCompositionImports });
}
function componentsHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.components))
        return;
    (0, helpers_1.cloneObject)(inputMapper.components, outputMapper.components);
}
function propsHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.props))
        return;
    outputMapper.newCompositionImports.push("toRefs");
    const oSetup = outputMapper.setup;
    const iProps = inputMapper.props;
    (0, helpers_1.cloneObject)(iProps, outputMapper.props);
    const propNames = iProps.getProperties().map((prop) => prop.getName());
    inputMapper.propNames = propNames;
    //Declare props as ref in setup
    let splitter = propNames.length > 2 ? "\n" : " ";
    let str = `const { ${propNames.reduce((acc, prop) => acc + `,${splitter}${prop}`)} } = toRefs(props)`;
    oSetup.addVariableStatement({
        declarationKind: ts_morph_2.VariableDeclarationKind.Const,
        declarations: [],
    }).replaceWithText(str);
}
function dataHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.data))
        return;
    outputMapper.newCompositionImports.push("ref");
    const oSetup = outputMapper.setup;
    const iData = inputMapper.data;
    const dataProps = iData.getProperties()
        .map((prop) => ({ name: prop.getName(), value: prop.getInitializer().print() }));
    inputMapper.dataProps = dataProps;
    const declarations = dataProps.map((p) => ({ name: p.name, initializer: `ref(${p.value})`, kind: 40 }));
    oSetup.addVariableStatements([{
            declarationKind: ts_morph_2.VariableDeclarationKind.Const,
            declarations,
        }]);
}
function computedHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.computed))
        return;
    outputMapper.newCompositionImports.push("computed");
    const oSetup = outputMapper.setup;
    const iComputed = inputMapper.computed;
    let computedStatements = [];
    switch (iComputed.getKind()) {
        case ts_morph_1.ts.SyntaxKind.CallExpression:
            // computedStatements = computedAsCall(inputMapper);
            inputMapper.isComputedResolved = false;
            return;
            break;
        case ts_morph_1.ts.SyntaxKind.ObjectLiteralExpression:
            computedStatements = (0, computedHandlers_1.computedAsObject)(inputMapper);
            break;
        default: throw "Wrong computed type";
    }
    oSetup.addStatements(computedStatements);
}
function methodsHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.methods))
        return;
    const oSetup = outputMapper.setup;
    const iMethods = inputMapper.methods;
    let methodDeclares = iMethods.getChildrenOfKind(ts_morph_1.ts.SyntaxKind.MethodDeclaration);
    //Transform methods in input to output
    const functionStrings = [];
    inputMapper.methodNames = [];
    let methodString = '';
    methodDeclares.forEach((method) => {
        inputMapper.methodNames.push(method.getName());
        const paramsString = method.getParameters().map(p => p.print()).join(', ');
        methodString = `const ${method.getName()} = `;
        methodString += method.isAsync() ? `async ` : '';
        methodString += `(${paramsString}) => ${method.getBody().print()}`;
        functionStrings.push(methodString);
    });
    const statements = oSetup.addStatements(functionStrings);
    //clean this keywords from statements
    statements.forEach((statement) => {
        (0, helpers_1.processThisKeywordAccess)(statement, inputMapper);
    });
}
function watchHandler(inputMapper, outputMapper) {
    if ((0, helpers_1.isNodeEmpty)(inputMapper.watch))
        return;
    outputMapper.newCompositionImports.push("watch");
    const oSetup = outputMapper.setup;
    const iWatchProps = inputMapper.watch.getProperties();
    //Transform all watch in input to output
    let watchStrings = [], exp = '', name = '';
    iWatchProps.forEach((watch) => {
        if (!watch.isKind(ts_morph_1.ts.SyntaxKind.MethodDeclaration))
            return;
        name = watch.getName();
        const params = watch.getParameters().map((param) => param.getName());
        exp = `watch(${name}, (${params.join(', ')}) => ${watch.getBody().print()})`;
        watchStrings.push(exp);
    });
    const statements = oSetup.addStatements(watchStrings);
    //clean this keywords from statements
    statements.forEach((statement) => {
        (0, helpers_1.processThisKeywordAccess)(statement, inputMapper);
    });
}
function setupReturnHandler(inputMapper, outputMapper) {
    const oSetup = outputMapper.setup;
    const rStatement = oSetup.addStatements(["return {}"])[0];
    //combine dataProps, computedNames, methodNames in inputMapper (props is exported implicically in object)
    const returnNames = inputMapper.dataProps.map(p => p.name).concat(inputMapper.computedNames, inputMapper.methodNames);
    rStatement.getExpression().addShorthandPropertyAssignments(returnNames.map(name => ({ name })));
}
function markUnsureExpression(inputMapper, outputMapper) {
    const oSetup = outputMapper.setup;
    const outputFile = oSetup.getSourceFile();
    //Mark unsure call expressions with comments
    let callExps = oSetup.getDescendantsOfKind(ts_morph_1.ts.SyntaxKind.CallExpression);
    let callName = '';
    const commentedPosis = [];
    for (let i = 0; i < callExps.length; i++) {
        const exp = callExps[i];
        callName = exp.getExpression().print();
        // skip if the function is sure
        if (inputMapper.methodNames.includes(callName)
            || consts_1.BUILTIN_IDENTIFIERS.find((iden) => callName.startsWith(iden))
            || outputMapper.newCompositionImports.find((iden) => callName.startsWith(iden)))
            continue;
        //the function called is unsure
        const pos = exp.getStartLinePos();
        if (commentedPosis.find(p => pos - p < consts_1.UNSURE_EXPRESSION.length + 4 && pos - p > -1))
            continue; //skip if the comment lines is consecutive
        commentedPosis.push(pos);
        (0, helpers_1.addComment)(outputFile, exp, consts_1.UNSURE_EXPRESSION, outputMapper);
        callExps = outputMapper.setup.getDescendantsOfKind(ts_morph_1.ts.SyntaxKind.CallExpression);
    }
    if (!inputMapper.isComputedResolved) {
        const outputFile = oSetup.getSourceFile();
        // Cannot process this kind of computed now. Add the computed as-is to the export object.
        let prop = (0, helpers_1.copyObjectToProperyAssignment)(inputMapper.computed, outputMapper.exportedObject, 'computed');
        //add comment to highlight the computed object
        (0, helpers_1.addComment)(outputFile, prop, consts_1.UNRESOLVED_PROPERTY, outputMapper);
    }
    // TODO: IMPLEMENT MIXINS HANDLER AND REMOVE THIS BLOCK
    let prop = (0, helpers_1.copyObjectToProperyAssignment)(inputMapper.mixins, outputMapper.exportedObject, 'mixins');
    (0, helpers_1.addComment)(outputFile, prop, consts_1.UNRESOLVED_PROPERTY, outputMapper);
}
//# sourceMappingURL=baseHandlers.js.map