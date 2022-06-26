import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure, ParameterDeclaration, ObjectLiteralElementLike } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, FunctionDeclaration,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import { BUILTIN_IDENTIFIERS, UNRESOLVED_PROPERTY, UNSURE_EXPRESSION } from "../consts";
import {cloneObject, findExportNode, processThisKeywordAccess, isNodeEmpty, addComment,
        getReturnedExpression, copyObjectToProperyAssignment, constructMainOutputMapper} from "../helpers";
import { InputMapper, OutputMapper } from "../models/mapperModel";
import {computedAsObject, computedAsCall} from "./computedHandlers"
import {mixinsToComposables} from "./mixinsHandler"
import handleHooks from "./hooksHandler"
import convertClassToOptions from "./classToOptionsHandler";

export default function makeVue3CodeFromVue2Export(inputSource: SourceFile, outputFile: SourceFile): string {
    //prepare template object
    const inputObjectNode = findExportNode(inputSource)?.getExpression() as ObjectLiteralExpression;

    //copy import to template object
    const imports = inputSource.getChildrenOfKind(ts.SyntaxKind.ImportDeclaration);
    imports.forEach(imp => outputFile.addImportDeclaration({moduleSpecifier: ""}).replaceWithText(imp.print()));
    let inputProperties: ObjectLiteralElementLike[] = [];
    const inputMapper = new InputMapper();
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
    inputMapper.data = getReturnedExpression(inputMapper.data) as ObjectLiteralExpression;
    handleMapping(inputMapper, outputFile)
    return outputFile.print();
}

//apply the mapping to templateObject
function handleMapping(inputMapper: InputMapper, outputFile: SourceFile) {
    const outputMapper = constructMainOutputMapper(outputFile);
    console.log(' - handling data, props');
    componentsHandler(inputMapper, outputMapper);
    propsHandler(inputMapper, outputMapper);
    dataHandler(inputMapper, outputMapper);
    console.log(' - handling mixins');
    mixinsToComposables(inputMapper, outputMapper);
    console.log(' - handling computed, methods, watch');
    computedHandler(inputMapper, outputMapper);
    methodsHandler(inputMapper, outputMapper);
    watchHandler(inputMapper, outputMapper);
    console.log(' - handling hooks');
    handleHooks(inputMapper, outputMapper);
    setupReturnHandler(inputMapper, outputMapper);
    console.log(' - marking unsure expressions');
    markUnsureExpression(inputMapper, outputMapper);
    //finally add imported functions from vue-composition-api
    outputFile.addImportDeclaration({moduleSpecifier: "@vue/composition-api", namedImports: outputMapper.newCompositionImports});
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
    if (isNodeEmpty(inputMapper.data)) return;
    outputMapper.newCompositionImports.push("ref");
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const iData = inputMapper.data as ObjectLiteralExpression;
    const dataProps = (iData as ObjectLiteralExpression).getProperties()
                        .map((prop: PropertyAssignment) => ({name: prop.getName(), value: prop.getInitializer().print()}));
    inputMapper.dataProps = dataProps;
    const declarations = dataProps.map<VariableDeclarationStructure>((p) => ({name: p.name, initializer: `ref(${p.value})`, kind: 40}))
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
            computedStatements = computedAsObject(inputMapper);
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
        const paramsString = method.getParameters().map(p => p.print()).join(', ');
        methodString = `const ${method.getName()} = `;
        methodString += method.isAsync() ? `async ` : '';
        methodString += `(${paramsString}) => ${method.getBody().print()}`;
        functionStrings.push(methodString);
    })
    const statements = oSetup.addStatements(functionStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper);
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
        if (!watch.isKind(ts.SyntaxKind.MethodDeclaration))
            return;
        name = watch.getName();
        const params = watch.getParameters().map((param: ParameterDeclaration) => param.getName());
        exp = `watch(${name}, (${params.join(', ')}) => ${watch.getBody().print()})`
        watchStrings.push(exp)
    })
    const statements = oSetup.addStatements(watchStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper);
    })
}

function setupReturnHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const rStatement = oSetup.addStatements(["return {}"])[0] as ReturnStatement;
    //combine dataProps, computedNames, methodNames in inputMapper (props is exported implicically in object)
    const returnNames = inputMapper.dataProps.map(p => p.name).concat(inputMapper.computedNames, inputMapper.methodNames);
    (rStatement.getExpression() as ObjectLiteralExpression).addShorthandPropertyAssignments(returnNames.map(name => ({name})));
}

function markUnsureExpression(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = (outputMapper.setup as MethodDeclaration);
    const outputFile = oSetup.getSourceFile();
    //Mark unsure call expressions with comments
    let callExps = oSetup.getDescendantsOfKind(ts.SyntaxKind.CallExpression);
    let callName = '';
    const commentedPosis = [];
    for (let i = 0; i < callExps.length; i++) {
        const exp = callExps[i];
        callName = exp.getExpression().print();
        // skip if the function is sure
        if (inputMapper.methodNames.includes(callName) 
            || BUILTIN_IDENTIFIERS.find((iden) => callName.startsWith(iden))
            || outputMapper.newCompositionImports.find((iden) => callName.startsWith(iden)))
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
    let prop = copyObjectToProperyAssignment(inputMapper.mixins, outputMapper.exportedObject, 'mixins')
    addComment(outputFile, prop, UNRESOLVED_PROPERTY, outputMapper);
}
