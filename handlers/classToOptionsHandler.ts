import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure, ParameterDeclaration, ObjectLiteralElementLike, ClassDeclaration, StringLiteral, MethodDeclarationStructure, StructureKind } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, FunctionDeclaration,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind } from "ts-morph";
import { AVAILABLE_HOOKS } from "../consts";
import {getReturnedExpression} from "../helpers";

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
    const dataMethod = decoratorObject.addMethod({
        name: 'data',
        statements: [`return {}`]
    });
    const dataObject = getReturnedExpression(dataMethod) as ObjectLiteralExpression;
    const assigns = []
    dataDeclares.forEach(p => {
        const name = p.getName();
        //this data is a property -> skip this
        if (propsNames.includes(name))
            return;
        assigns.push({ name, initializer: p.getInitializer().print() })
    })
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
    getAccessors.forEach(p => {
        const name = p.getName();
        //add the computed to computedObject
        computedObject.addMethod({
            name
        }).getBody().replaceWithText(`${p.getBody().print()}`)
    })
}

function mapWatch(decoratorObject: ObjectLiteralExpression, mainClass: ClassDeclaration){
    //Get all method that have @Watch
    const watchMethods = mainClass.getDescendantsOfKind(ts.SyntaxKind.Decorator)
                            .filter((d) => d.getCallExpression().getExpression().print() === 'Watch')
                            .map((d) => d.getParent()) as MethodDeclaration[];
    if (watchMethods.length == 0)
        return;
    const watchObject = decoratorObject.addPropertyAssignment({
        name: 'watch', initializer: `{}`,
    }).getInitializer() as ObjectLiteralExpression;
    const watchNames = []
    watchMethods.forEach(watch => {
        const name = (watch.getDecorator('Watch').getCallExpression().getArguments()[0] as StringLiteral).getLiteralText();
        //add the method to watchObject
        watchObject.addMethod({
            name
        }).getBody().replaceWithText(`${watch.getBody().print()}`)
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