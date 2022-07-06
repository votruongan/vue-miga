import { ts, SourceFile, ReturnStatement, VariableDeclarationStructure, ParameterDeclaration, ObjectLiteralElementLike, VariableStatement, ArrowFunction, NamedImports, ImportDeclarationStructure } from "ts-morph";
import { MethodDeclaration, CallExpression, FunctionDeclaration, VariableDeclaration,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import { BUILTIN_IDENTIFIERS, TRANSFORMED_IDENTIFIERS, UNRESOLVED_PROPERTY, UNSURE_EXPRESSION } from "../consts";
import {cloneObject, findExportNode, processThisKeywordAccess, isNodeEmpty, addComment,
        getReturnedExpression, copyObjectToProperyAssignment, constructMainOutputMapper, getBlockFunctionName, getParamsString} from "../helpers";
import { InputMapper, OutputMapper } from "../models/mapperModel";
import {computedAsObject, computedAsCall} from "./computedHandlers"
import {mixinsToComposables} from "./mixinsHandler"
import handleHooks from "./hooksHandler"
import convertClassToOptions from "./classToOptionsHandler";
import { HandlerPayload } from "../models/payload";

export default function makeVue3CodeFromVue2Export(inputSource: SourceFile, outputFile: SourceFile): string {
    //prepare template object
    const inputObjectNode = findExportNode(inputSource)?.getExpression() as ObjectLiteralExpression;
    const inputMapper = new InputMapper();

    //copy import to template object
    const imports = inputSource.getChildrenOfKind(ts.SyntaxKind.ImportDeclaration);
    imports.forEach(imp => {
        //save imported identifier names 
        const clause = imp.getImportClause();
        const defImp = clause.getDefaultImport();
        inputMapper.importedIdentifierNames = inputMapper.importedIdentifierNames.concat(clause.getNamedImports().map((i) => i.getName()))
        defImp && inputMapper.importedIdentifierNames.push(defImp.print())
        outputFile.addImportDeclaration({moduleSpecifier: ""}).replaceWithText(imp.print())
    });

    //prepare properties of input component according to its style (class or options)
    let inputProperties: ObjectLiteralElementLike[] = [];
    if (inputObjectNode?.getProperties){
        //the input file is option API
        inputProperties = inputObjectNode.getProperties();
    }
    else {
        //try to read file as class component
        const mainClass = inputSource.getFirstChildByKind(ts.SyntaxKind.ClassDeclaration);
        if (!mainClass) 
            throw `ERROR: Input file is not Vue option/class component`;
        inputProperties = convertClassToOptions(mainClass);
    }
    //save only neccessary properties and methods to inputMapper
    inputProperties.forEach(node => {
        let key = (node as PropertyAssignment).getName(), value;
        switch (node.getKind()){
            case ts.SyntaxKind.PropertyAssignment: 
                value = (node as PropertyAssignment).getInitializer();
                break;
            case ts.SyntaxKind.MethodDeclaration:
                value = (node as MethodDeclaration).getBody();
                break;
            default: throw `'${key}' type is not valid.`
        }
        if (inputMapper[key]) inputMapper[key] = value;
    })
    handleMapping(inputSource, inputMapper, outputFile)
    return outputFile.print();
}

//apply the mapping to templateObject
function handleMapping(inputSource: SourceFile, inputMapper: InputMapper, outputSource: SourceFile) {
    const outputMapper = constructMainOutputMapper(outputSource);
    //copy codes in the file that don't belong to component
    copyOtherCode(inputSource, inputMapper, outputSource);
    //start mapping
    const payload: HandlerPayload = {
        inputSource, inputMapper, outputMapper, outputSource
    }
    console.log(' - handling data, props');
    componentsHandler(inputMapper, outputMapper);
    propsHandler(inputMapper, outputMapper);
    dataHandler(inputMapper, outputMapper);
    console.log(' - handling mixins');
    mixinsToComposables(payload);
    console.log(' - handling computed, methods, watch');
    computedHandler(inputMapper, outputMapper);
    methodsHandler(inputMapper, outputMapper);
    watchHandler(inputMapper, outputMapper);
    console.log(' - handling hooks');
    handleHooks(inputMapper, outputMapper);
    //Declare $refs as new ref
    declareRefsAndEmits(inputMapper, outputMapper);
    setupReturnHandler(inputMapper, outputMapper);
    console.log(' - marking unsure expressions');
    const oImports = outputMapper.otherImports;
    const imports : ImportDeclarationStructure[] = Object.keys(oImports).map(key => ({
        moduleSpecifier: key, namedImports: Array.from(oImports[key].namedImports || []), defaultImport: oImports[key].defaultImport, kind: 16,
    }))
    markUnsureExpression(inputMapper, outputMapper);
    //finally add imported functions from vue-composition-api
    outputSource.addImportDeclarations(imports);
    outputSource.addImportDeclaration({moduleSpecifier: "@vue/composition-api", namedImports: outputMapper.newCompositionImports});
}

function componentsHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.components)) return;
    cloneObject(inputMapper.components, outputMapper.components);
}

function propsHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.props)) return;
    outputMapper.newCompositionImports.push("toRefs");
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const iProps = inputMapper.props as ObjectLiteralExpression;
    cloneObject(iProps, outputMapper.props);
    const propNames = iProps.getProperties().map((prop: PropertyAssignment) => prop.getName());
    inputMapper.propNames = propNames;
    //Declare props as ref in setup
    let splitter = propNames.length > 2 ? "\n" : " ";
    let str = `const { ${propNames.reduce((acc, prop) => acc + `,${splitter}${prop}`)} } = toRefs(props)`;
    oSetup.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [],
    }).replaceWithText(str)
}

function dataHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    const iData = inputMapper.data.getParent() as MethodDeclaration;
    const dataProps = (getReturnedExpression(iData.getBody()) as ObjectLiteralExpression).getProperties();
    if (dataProps.length < 1) return;
    outputMapper.newCompositionImports.push("ref");
    const oSetup = (outputMapper.setup as MethodDeclaration);
    inputMapper.dataProps = dataProps;
    //Create an object to map type in data properties
    const dataType = {}
    iData.getFirstChildByKind(ts.SyntaxKind.TypeLiteral)?.getProperties().forEach((p) => dataType[p.getName()] = p.getChildAtIndex(2).getText());
    //Prepare data declaration in new setup
    const declarations = dataProps.map<VariableDeclarationStructure>((p: PropertyAssignment) => {
        const name = p.getName();
        const initString = `ref<${dataType?.[name] || 'any'}>(${p.getInitializer().print()})`;
        return {name, initializer: initString, kind: 40}
    })
    oSetup.addVariableStatements([{
        declarationKind: VariableDeclarationKind.Const,
        declarations,
    }])
}

function computedHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.computed)) return;
    outputMapper.newCompositionImports.push("computed");
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const iComputed = inputMapper.computed;
    let computedStatements = [];
    switch (iComputed.getKind()) {
        case ts.SyntaxKind.CallExpression:
            // computedStatements = computedAsCall(inputMapper);
            inputMapper.isComputedResolved = false;
            return;
            break;
        case ts.SyntaxKind.ObjectLiteralExpression:
            computedStatements = computedAsObject(inputMapper, outputMapper);
            break;
        default: throw "Wrong computed type"
    }
    oSetup.addStatements(computedStatements)
}

function methodsHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.methods)) return;
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const iMethods = inputMapper.methods as ObjectLiteralExpression;
    let methodDeclares = iMethods.getChildrenOfKind(ts.SyntaxKind.MethodDeclaration) as MethodDeclaration[];
    
    //Transform methods in input to output
    const functionStrings = [];
    inputMapper.methodNames = [];
    let methodString = '';
    methodDeclares.forEach((method) => {
        inputMapper.methodNames.push(method.getName())
        const paramsString = getParamsString(method);
        const mType = method.getReturnTypeNode()?.getText();
        methodString = `const ${method.getName()} = `;
        methodString += method.isAsync() ? `async ` : '';
        methodString += `(${paramsString})${mType ? `: ${mType}` : ''} => ${method.getBody().print()}`;
        functionStrings.push(methodString);
    })
    const statements = oSetup.addStatements(functionStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper, outputMapper);
    })
}

function watchHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.watch)) return;
    outputMapper.newCompositionImports.push("watch");
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const iWatchProps = (inputMapper.watch as ObjectLiteralExpression).getProperties();

    //Transform all watch in input to output
    let watchStrings = [], exp = '', name = '';
    iWatchProps.forEach((watch: MethodDeclaration) => {
        name = watch.getName();
        let propInit = null;
        //process if this watch is declared as property, not method
        if (!watch.isKind(ts.SyntaxKind.MethodDeclaration)){
            propInit = (watch as PropertyAssignment).getInitializer();
            if (! [ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionExpression].includes(propInit)){
                console.log('/ ! \\ Found watcher not in method, arrow function property or function property')
                return;
            }
        }
        //construct the watch string
        let paramsString = getParamsString(propInit ? (propInit as ArrowFunction) : watch);
        const bodyString = (propInit ? (propInit as ArrowFunction) : watch).getBody().print();
        exp = `watch(${name}, ${watch.isAsync ? 'async' : ''} (${paramsString}) => ${bodyString})`
        watchStrings.push(exp)
    })
    const statements = oSetup.addStatements(watchStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper, outputMapper);
    })
}

function declareRefsAndEmits(inputMapper: InputMapper, outputMapper: OutputMapper) {
    if (inputMapper.refsNames.size < 1) return;
    const oSetup = (outputMapper.setup as MethodDeclaration);
    if (!outputMapper.newCompositionImports.includes('ref'))
        outputMapper.newCompositionImports.push('ref');
    //Prepare data declaration in new setup
    const declarations = Array.from(inputMapper.refsNames).map<VariableDeclarationStructure>((name: string) => {
        const initString = `ref<HTMLElement | null>(null)`;
        return {name, initializer: initString, kind: 40}
    })
    oSetup.addVariableStatements([{
        declarationKind: VariableDeclarationKind.Const,
        declarations,
    }]).forEach(n => n.setOrder(1));
    //Add emits to output property of export object
    if (inputMapper.emitsNames.size < 1) return;
    outputMapper.exportedObject.addPropertyAssignment({
        name: 'emits', initializer: `['${Array.from(inputMapper.emitsNames).join("', '")}']`,
    })
}

function setupReturnHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const rStatement = oSetup.addStatements(["return {}"])[0] as ReturnStatement;
    //combine dataProps, computedNames, methodNames in inputMapper (props is exported implicically in object)
    let returnNames = inputMapper.dataProps.map(p => p.getName()).concat(inputMapper.computedNames, inputMapper.methodNames);
    returnNames = returnNames.concat(Array.from(inputMapper.refsNames));
    (rStatement.getExpression() as ObjectLiteralExpression).addShorthandPropertyAssignments(returnNames.map(name => ({name})));
}

function markUnsureExpression(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const outputFile = oSetup.getSourceFile();
    //Mark unsure call expressions with comments
    let callExps = oSetup.getDescendantsOfKind(ts.SyntaxKind.CallExpression);
    const commentedPosis = [];
    for (let i = 0; i < callExps.length; i++) {
        const exp = callExps[i];
        // skip if the function is sure
        if (isCallExpressionDefined(exp, inputMapper, outputMapper))
            continue;

        //the function called is unsure
        const pos = exp.getStartLinePos();
        if (commentedPosis.find(p => pos - p < UNSURE_EXPRESSION.length + 4 && pos - p > -1))
            continue; //skip if the comment lines is consecutive

        commentedPosis.push(pos);
        addComment(outputFile, exp, UNSURE_EXPRESSION, outputMapper);
        callExps = outputMapper.setup.getDescendantsOfKind(ts.SyntaxKind.CallExpression);
    }
    if (!inputMapper.isComputedResolved){
        const outputFile = oSetup.getSourceFile();
        // Cannot process this kind of computed now. Add the computed as-is to the export object.
        let prop = copyObjectToProperyAssignment(inputMapper.computed, outputMapper.exportedObject, 'computed')
        //add comment to highlight the computed object
        addComment(outputFile, prop, UNRESOLVED_PROPERTY, outputMapper);
    }
    // TODO: IMPLEMENT MIXINS HANDLER AND REMOVE THIS BLOCK
    if (!isNodeEmpty(inputMapper.mixins)){
        let prop = copyObjectToProperyAssignment(inputMapper.mixins, outputMapper.exportedObject, 'mixins')
        addComment(outputFile, prop, UNRESOLVED_PROPERTY, outputMapper);
    }
}

// copy codes that is not import or export node
function copyOtherCode(inputSource: SourceFile, inputMapper: InputMapper, outputSource: SourceFile){
    const caredNodes = [ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ExportAssignment, ts.SyntaxKind.ClassDeclaration]
    //get nodes that haven't been taken care of
    const otherNodes = inputSource.getChildSyntaxList().getChildren().filter(c => !caredNodes.includes(c.getKind()));
    const statements = [];
    otherNodes.forEach((node) => {
        switch (node.getKind()){
            case ts.SyntaxKind.EmptyStatement:
                return;
            case ts.SyntaxKind.VariableStatement:
                (node as VariableStatement).getDeclarations().forEach((d) => inputMapper.localFileVariableNames.push(d.getName()));
                break;
            case ts.SyntaxKind.FunctionDeclaration:
                inputMapper.localFileFunctionNames.push((node as FunctionDeclaration).getName())
                break;
        }
        statements.push(node.print())
    })
    outputSource.addStatements(statements);
}

const functionsInBlockScope = {};
function isCallExpressionDefined(callExp: CallExpression, inputMapper: InputMapper, outputMapper: OutputMapper) {
    const callName = callExp.getExpression().print();
    const check = inputMapper.methodNames.includes(callName) 
                || inputMapper.localFileFunctionNames.includes(callName)
                || callName.startsWith('context.')
                || TRANSFORMED_IDENTIFIERS.find((iden) => callName.startsWith(iden))
                || BUILTIN_IDENTIFIERS.find((iden) => callName.startsWith(iden))
                || outputMapper.newCompositionImports.find((iden) => callName.startsWith(iden))
                || inputMapper.importedIdentifierNames.find((iden) => callName.startsWith(iden));
                
    if (check) return true;

    //check if callName is in other imports
    const oImports = outputMapper.otherImports;
    const keys = Object.keys(oImports)
    for (let key of keys) {
        if (oImports[key].defaultImport === callName) return true;
        if (oImports[key].namedImports?.has(callName)) return true;
    }

    //Check if the call name is in the block scope
    const parentBlocks = callExp.getAncestors().filter(a => a.isKind(ts.SyntaxKind.Block))
    for (let b of parentBlocks) {
        let blockParent = getBlockFunctionName(b);
        if (!blockParent)
            continue;
        const name = blockParent.getName();
        if (!name || name === 'setup')
            continue;
        
        //get all functions in block scope
        if (!functionsInBlockScope[name]){
            if (blockParent.isKind(ts.SyntaxKind.VariableDeclaration))
                blockParent = (blockParent as VariableDeclaration).getFirstChildByKind(ts.SyntaxKind.ArrowFunction)
            if (!blockParent || !blockParent.getBody)
                continue;
            // get function declared as functions
            functionsInBlockScope[name] = blockParent.getBody().getFunctions().map((f) => f.getName());

            //get function declared as arrow functions
            const varDeclares = blockParent.getBody().getChildrenOfKind(ts.SyntaxKind.VariableStatement)
                                    .map((v: VariableStatement) => v.getDeclarations()).flat();
            const arrowFunctionParents: VariableDeclaration[] = varDeclares.map(d => d.getInitializerIfKind(ts.SyntaxKind.ArrowFunction)?.getParent())
                                                                .filter(a => a);
            functionsInBlockScope[name] = functionsInBlockScope[name].concat(arrowFunctionParents.map(a => a.getName()));
        }
        if (functionsInBlockScope[name].includes(callName))
            return true
    }
}