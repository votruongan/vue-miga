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
    const inputMapper = new mapperModel_1.InputMapper();
    //copy import to template object
    const imports = inputSource.getChildrenOfKind(ts_morph_1.ts.SyntaxKind.ImportDeclaration);
    imports.forEach(imp => {
        //save imported identifier names 
        const clause = imp.getImportClause();
        const defImp = clause.getDefaultImport();
        inputMapper.importedIdentifierNames = inputMapper.importedIdentifierNames.concat(clause.getNamedImports().map((i) => i.getName()));
        defImp && inputMapper.importedIdentifierNames.push(defImp.print());
        outputFile.addImportDeclaration({ moduleSpecifier: "" }).replaceWithText(imp.print());
    });
    //prepare properties of input component according to its style (class or options)
    let inputProperties = [];
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
    handleMapping(inputSource, inputMapper, outputFile);
    return outputFile.print();
}
exports.default = makeVue3CodeFromVue2Export;
//apply the mapping to templateObject
function handleMapping(inputSource, inputMapper, outputFile) {
    const outputMapper = (0, helpers_1.constructMainOutputMapper)(outputFile);
    //copy codes in the file that don't belong to component
    copyOtherCode(inputSource, inputMapper, outputFile);
    //start mapping
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
    var _a;
    if ((0, helpers_1.isNodeEmpty)(inputMapper.data))
        return;
    outputMapper.newCompositionImports.push("ref");
    const oSetup = outputMapper.setup;
    const iData = inputMapper.data.getParent();
    const dataProps = (0, helpers_1.getReturnedExpression)(iData.getBody()).getProperties();
    inputMapper.dataProps = dataProps;
    //Create an object to map type in data properties
    const dataType = {};
    (_a = iData.getFirstChildByKind(ts_morph_1.ts.SyntaxKind.TypeLiteral)) === null || _a === void 0 ? void 0 : _a.getProperties().forEach((p) => dataType[p.getName()] = p.getChildAtIndex(2).getText());
    //Prepare data declaration in new setup
    const declarations = dataProps.map((p) => {
        const name = p.getName();
        const initString = `ref<${(dataType === null || dataType === void 0 ? void 0 : dataType[name]) || 'any'}>(${p.getInitializer().print()})`;
        return { name, initializer: initString, kind: 40 };
    });
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
        var _a;
        inputMapper.methodNames.push(method.getName());
        const paramsString = (0, helpers_1.getParamsString)(method);
        const mType = (_a = method.getReturnTypeNode()) === null || _a === void 0 ? void 0 : _a.getText();
        methodString = `const ${method.getName()} = `;
        methodString += method.isAsync() ? `async ` : '';
        methodString += `(${paramsString})${mType ? `: ${mType}` : ''} => ${method.getBody().print()}`;
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
        name = watch.getName();
        let propInit = null;
        //process if this watch is declared as property, not method
        if (!watch.isKind(ts_morph_1.ts.SyntaxKind.MethodDeclaration)) {
            propInit = watch.getInitializer();
            if (![ts_morph_1.ts.SyntaxKind.ArrowFunction, ts_morph_1.ts.SyntaxKind.FunctionExpression].includes(propInit)) {
                console.log('/ ! \\ Found watcher not in method, arrow function property or function property');
                return;
            }
        }
        //construct the watch string
        let paramsString = (0, helpers_1.getParamsString)(propInit ? propInit : watch);
        const bodyString = (propInit ? propInit : watch).getBody().print();
        exp = `watch(${name}, ${watch.isAsync ? 'async' : ''} (${paramsString}) => ${bodyString})`;
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
    const returnNames = inputMapper.dataProps.map(p => p.getName()).concat(inputMapper.computedNames, inputMapper.methodNames);
    rStatement.getExpression().addShorthandPropertyAssignments(returnNames.map(name => ({ name })));
}
function markUnsureExpression(inputMapper, outputMapper) {
    const oSetup = outputMapper.setup;
    const outputFile = oSetup.getSourceFile();
    //Mark unsure call expressions with comments
    let callExps = oSetup.getDescendantsOfKind(ts_morph_1.ts.SyntaxKind.CallExpression);
    const commentedPosis = [];
    for (let i = 0; i < callExps.length; i++) {
        const exp = callExps[i];
        // skip if the function is sure
        if (isCallExpressionDefined(exp, inputMapper, outputMapper))
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
    if (!(0, helpers_1.isNodeEmpty)(inputMapper.mixins)) {
        let prop = (0, helpers_1.copyObjectToProperyAssignment)(inputMapper.mixins, outputMapper.exportedObject, 'mixins');
        (0, helpers_1.addComment)(outputFile, prop, consts_1.UNRESOLVED_PROPERTY, outputMapper);
    }
}
// copy codes that is not import or export node
function copyOtherCode(inputSource, inputMapper, outputSource) {
    const caredNodes = [ts_morph_1.ts.SyntaxKind.ImportDeclaration, ts_morph_1.ts.SyntaxKind.ExportAssignment, ts_morph_1.ts.SyntaxKind.ClassDeclaration];
    //get nodes that haven't been taken care of
    const otherNodes = inputSource.getChildSyntaxList().getChildren().filter(c => !caredNodes.includes(c.getKind()));
    const statements = [];
    otherNodes.forEach((node) => {
        switch (node.getKind()) {
            case ts_morph_1.ts.SyntaxKind.EmptyStatement:
                return;
            case ts_morph_1.ts.SyntaxKind.VariableStatement:
                node.getDeclarations().forEach((d) => inputMapper.localFileVariableNames.push(d.getName()));
                break;
            case ts_morph_1.ts.SyntaxKind.FunctionDeclaration:
                inputMapper.localFileFunctionNames.push(node.getName());
                break;
        }
        statements.push(node.print());
    });
    outputSource.addStatements(statements);
}
const functionsInBlockScope = {};
function isCallExpressionDefined(callExp, inputMapper, outputMapper) {
    const callName = callExp.getExpression().print();
    const check = inputMapper.methodNames.includes(callName)
        || inputMapper.localFileFunctionNames.includes(callName)
        || consts_1.BUILTIN_IDENTIFIERS.find((iden) => callName.startsWith(iden))
        || outputMapper.newCompositionImports.find((iden) => callName.startsWith(iden))
        || inputMapper.importedIdentifierNames.find((iden) => callName.startsWith(iden));
    if (check)
        return true;
    //check if callName is in imports
    //Check if the call name is in the block scope
    const parentBlocks = callExp.getAncestors().filter(a => a.isKind(ts_morph_1.ts.SyntaxKind.Block));
    for (let b of parentBlocks) {
        let blockParent = (0, helpers_1.getBlockFunctionName)(b);
        if (!blockParent)
            continue;
        const name = blockParent.getName();
        if (!name || name === 'setup')
            continue;
        //get all functions in block scope
        if (!functionsInBlockScope[name]) {
            if (blockParent.isKind(ts_morph_1.ts.SyntaxKind.VariableDeclaration))
                blockParent = blockParent.getFirstChildByKind(ts_morph_1.ts.SyntaxKind.ArrowFunction);
            if (!blockParent || !blockParent.getBody)
                continue;
            // get function declared as functions
            functionsInBlockScope[name] = blockParent.getBody().getFunctions().map((f) => f.getName());
            //get function declared as arrow functions
            const varDeclares = blockParent.getBody().getChildrenOfKind(ts_morph_1.ts.SyntaxKind.VariableStatement)
                .map((v) => v.getDeclarations()).flat();
            const arrowFunctionParents = varDeclares.map(d => { var _a; return (_a = d.getInitializerIfKind(ts_morph_1.ts.SyntaxKind.ArrowFunction)) === null || _a === void 0 ? void 0 : _a.getParent(); })
                .filter(a => a);
            functionsInBlockScope[name] = functionsInBlockScope[name].concat(arrowFunctionParents.map(a => a.getName()));
        }
        if (functionsInBlockScope[name].includes(callName))
            return true;
    }
}
//# sourceMappingURL=baseHandlers.js.map