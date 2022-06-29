import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure, ParameterDeclaration, ObjectLiteralElementLike, ClassDeclaration, StringLiteral, MethodDeclarationStructure, StructureKind, PropertyAssignmentStructure } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, FunctionDeclaration,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind } from "ts-morph";
import { AVAILABLE_HOOKS } from "../consts";
import {getParamsString, getReturnedExpression} from "../helpers";

export default function convertClassToOptions(mainClass: ClassDeclaration): ObjectLiteralElementLike[]{
    const decoratorExpression = mainClass.getDecorator('Component').getCallExpression();
    //temporary write the props to decoratorObject.
    if (!decoratorExpression.getArguments()?.length){
        //no argument found -> create new decorator object
        decoratorExpression.addArgument(`{}`);
    }
    const decoratorObject = decoratorExpression.getArguments()[0] as ObjectLiteralExpression;

    mapData(decoratorObject, mainClass);
    mapComputed(decoratorObject, mainClass);
    const watchNames = mapWatch(decoratorObject, mainClass);
    mapMethod(decoratorObject, mainClass, watchNames);

    const decoratorProps = (decoratorObject as ObjectLiteralExpression)?.getProperties();
    return decoratorProps;
}

function mapData(decoratorObject: ObjectLiteralExpression, mainClass: ClassDeclaration) {
    const dataDeclares = mainClass.getProperties();
    if (dataDeclares.length == 0)
        return;
    const propsNames = ((decoratorObject.getProperty('props') as PropertyAssignment)
                        ?.getInitializer() as ObjectLiteralExpression)
                        ?.getProperties().map((p: PropertyAssignment) => p.getName())
    const assigns = []
    dataDeclares.forEach(p => {
        const name = p.getName();
        //this data is a property -> skip this
        if (propsNames.includes(name))
            return;
        assigns.push({ name, initializer: p.getInitializer().print(), kind: 40, type: p.getChildAtIndex(2).getText()})
    })
    const dataMethod = decoratorObject.addMethod({
        name: 'data',
        statements: [`return {}`],
        returnType: `{${assigns.map(a => `${a.name}: ${a.type}`).join(', ')}}`,
    });
    const dataObject = getReturnedExpression(dataMethod) as ObjectLiteralExpression;
    //add the data to dataPlace in batch
    dataObject.addPropertyAssignments(assigns)
}

function mapComputed(decoratorObject: ObjectLiteralExpression, mainClass: ClassDeclaration) {
    const getAccessors = mainClass.getGetAccessors()
    if (getAccessors.length == 0)
        return;
    const computedObject = decoratorObject.addPropertyAssignment({
        name: 'computed', initializer: `{}`,
    }).getInitializer() as ObjectLiteralExpression;
    getAccessors.forEach(computed => {
        const name = computed.getName();
        const type = computed.getReturnTypeNode()?.getText();
        //add the computed to computedObject
        computedObject.addMethod({ name }).replaceWithText(`${name} (${getParamsString(computed)})${type ? `: ${type}` : ''} ${computed.getBody().print()}`)
    })
}

function mapWatch(decoratorObject: ObjectLiteralExpression, mainClass: ClassDeclaration){
    //Get all method that have @Watch
    const allWatchMethods = mainClass.getDescendantsOfKind(ts.SyntaxKind.Decorator)
                            .filter((d) => d.getCallExpression().getExpression().print() === 'Watch')
                            .map((d) => d.getParent()) as MethodDeclaration[];
    if (allWatchMethods.length == 0)
        return;
    const watchMethods = new Set(allWatchMethods)
    const watchObject = decoratorObject.addPropertyAssignment({
        name: 'watch', initializer: `{}`,
    }).getInitializer() as ObjectLiteralExpression;
    const watchNames = []
    let tmpWatch = []
    watchMethods.forEach(watch => {
        const allWatchVars = watch.getDecorators().filter(d => d.getCallExpression().getExpression().print() === 'Watch').map(d => d.getCallExpression().getArguments()[0].print());
        const name = allWatchVars.length > 1 ? `[${allWatchVars.join(', ')}]` : allWatchVars[0];
        // const name = (watch.getDecorator('Watch').getCallExpression().getArguments()[0] as StringLiteral).getLiteralText();
        //add the method to watchObject
        watchObject.addMethod({ name }).replaceWithText(`${name} (${getParamsString(watch)}) ${watch.getBody().print()}`)
        watchNames.push(watch.getName());
    })
    return watchNames;
}

function mapMethod(decoratorObject: ObjectLiteralExpression, mainClass: ClassDeclaration, watchNames: string[]) {
    const methods = mainClass.getMethods().filter(m => !watchNames.includes(m.getName()));
    const realMethods: string[] = [];
    const methodNames: string[] = [];
    methods.forEach((m) => {
        const name = m.getName();
        //hooks will have to be a new prop. Cannot declare in methods
        if (AVAILABLE_HOOKS.find((h) => h.toLowerCase() === name) || name === 'created'){
            createHook(m, decoratorObject)
            return;
        }
        realMethods.push(m.print());
        methodNames.push(name);
    });
    if (realMethods.length == 0)
        return
    const methodsObject = decoratorObject.addPropertyAssignment({
        name: 'methods', initializer: `{}`,
    }).getInitializer() as ObjectLiteralExpression;
    methodNames.forEach((name, index) => {
        methodsObject.addMethod({name}).replaceWithText(realMethods[index])
    })
}

function createHook(hookData: MethodDeclaration, decoratorObject: ObjectLiteralExpression){
    decoratorObject.addMethod({ name: hookData.getName(), }).replaceWithText(hookData.print());
}
