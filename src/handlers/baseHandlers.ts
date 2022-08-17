import { ts, SourceFile, ReturnStatement, VariableDeclarationStructure, ParameterDeclaration, ObjectLiteralElementLike, VariableStatement, ArrowFunction, NamedImports, ImportDeclarationStructure, Node } from "ts-morph";
import { MethodDeclaration, CallExpression, FunctionDeclaration, VariableDeclaration,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import { BUILTIN_IDENTIFIERS, TRANSFORMED_IDENTIFIERS, UNRESOLVED_PROPERTY, UNSURE_EXPRESSION } from "../consts";
import {cloneObject, findExportNode, processThisKeywordAccess, isNodeEmpty, addComment,
        getReturnedExpression, copyObjectToProperyAssignment, constructMainOutputMapper, getBlockFunctionName, getParamsString} from "../helpers/common";
import { InputMapper, OutputMapper } from "../models/mapperModel";
import {computedAsObject, computedAsCall} from "./computedHandlers"
import {mixinsToComposables} from "./mixinsHandler"
import handleHooks from "./hooksHandler"
import convertClassToOptions from "./classToOptionsHandlers/classToOptionsHandler";
import { HandlerPayload } from "../models/payload";
import watchHandler from "./watchHandlers";
import { isCallExpressionDefined } from "./identifiersChecker";

export default function makeVue3CodeFromVue2Export(inputSource: SourceFile, outputFile: SourceFile): string {
    //prepare template object
    console.log(outputFile.getFilePath())
    const inputObjectNode = findExportNode(inputSource)?.getExpression() as ObjectLiteralExpression;
    const inputMapper = new InputMapper();
    inputMapper.inputFile = inputSource;
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
            throw `Input file is not Vue option/class component`;
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
    console.log(' - handling computed');
    computedHandler(inputMapper, outputMapper);
    console.log(' - handling methods');
    methodsHandler(inputMapper, outputMapper);
    console.log(' - handling watch');
    watchHandler(inputMapper, outputMapper);
    console.log(' - handling hooks');
    handleHooks(inputMapper, outputMapper);
    //Declare $refs as new ref
    declareRefsAndEmits(inputMapper, outputMapper);
    setupReturnHandler(inputMapper, outputMapper);
    console.log(' - marking unsure expressions');
    markUnsureExpression(inputMapper, outputMapper);

    //finally add imported functions from vue-composition-api
    const oImports = outputMapper.otherImports;
    const imports : ImportDeclarationStructure[] = Object.keys(oImports).map(key => ({
        moduleSpecifier: key, namedImports: Array.from(oImports[key].namedImports || []), defaultImport: oImports[key].defaultImport, kind: 16,
    }))
    outputSource.addImportDeclarations(imports);
    if (outputMapper.newCompositionImports.length > 0)
        outputSource.addImportDeclaration({moduleSpecifier: "@vue/composition-api", namedImports: outputMapper.newCompositionImports});
}

function componentsHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.components)) return;
    cloneObject(inputMapper.components, outputMapper.components);
}

function propsHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.props)) return;
    outputMapper.newCompositionImports.push("toRefs");
    const oSetup = outputMapper.setup;
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
    const iData = inputMapper.data.getParent() as MethodDeclaration;
    const dataProps = (getReturnedExpression(iData.getBody()) as ObjectLiteralExpression).getProperties();
    if (dataProps.length < 1) return;
    outputMapper.newCompositionImports.push("ref");
    const oSetup = outputMapper.setup;
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
    const oSetup = outputMapper.setup;
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
    const oSetup = outputMapper.setup;
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

function declareRefsAndEmits(inputMapper: InputMapper, outputMapper: OutputMapper) {
    if (inputMapper.refsNames.size < 1) return;
    const oSetup = outputMapper.setup;
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
    const oSetup = outputMapper.setup;
    const rStatement = oSetup.addStatements(["return {}"])[0] as ReturnStatement;
    //combine dataProps, computedNames, methodNames in inputMapper (props is exported implicically in object)
    let returnNames = inputMapper.dataProps.map(p => p.getName()).concat(inputMapper.computedNames, inputMapper.methodNames);
    returnNames = returnNames.concat(Array.from(inputMapper.refsNames));
    (rStatement.getExpression() as ObjectLiteralExpression).addShorthandPropertyAssignments(returnNames.map(name => ({name})));
}

function markUnsureExpression(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = outputMapper.setup;
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
    outputMapper.unsureExpression.forEach((node) => {
        const pos = node.getStartLinePos();
        if (commentedPosis.find(p => pos - p < UNSURE_EXPRESSION.length + 4 && pos - p > -1))
            return; //skip if the comment lines is consecutive

        addComment(outputFile, node, UNSURE_EXPRESSION, outputMapper);
    })
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
