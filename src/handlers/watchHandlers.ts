import { ArrowFunction, MethodDeclaration, Node, ObjectLiteralExpression, PropertyAssignment, ts } from "ts-morph";
import { getParamsString, isNodeEmpty, processThisKeywordAccess } from "../helpers/common";
import { InputMapper, OutputMapper } from "../models/mapperModel";

export default function watchHandler(inputMapper: InputMapper, outputMapper: OutputMapper){
    if (isNodeEmpty(inputMapper.watch)) return;
    outputMapper.newCompositionImports.push("watch");
    const oSetup = outputMapper.setup;
    const iWatchProps = (inputMapper.watch as ObjectLiteralExpression).getProperties();

    //Transform all watch in input to output
    let watchStrings = [], exp = '', name = '';
    iWatchProps.forEach((watch: MethodDeclaration) => {
        name = watch.getName();
        //propInit will be null when watch is not a MethodDeclaration
        let propInit: Node = null;
        let watchObjectProps = [], isImmediateWatch = false;
        //process if this watch is declared as property, not method
        if (!watch.isKind(ts.SyntaxKind.MethodDeclaration)){
            propInit = getInitializerOfWatchInit(watch, name);
            if (propInit.isKind(ts.SyntaxKind.ObjectLiteralExpression)) {
                //take only properties that is not handler and immediate
                watchObjectProps = (propInit as ObjectLiteralExpression).getProperties()
                                    .filter((p: PropertyAssignment) => p.getName() !== 'handler' && p.getName() !== 'immediate')
                isImmediateWatch = !!((propInit as ObjectLiteralExpression)?.getProperty('immediate') as PropertyAssignment)?.getInitializer();
                propInit = ((propInit as ObjectLiteralExpression)?.getProperty('handler') as PropertyAssignment)?.getInitializer();
                if (!propInit) {
                    throw `Watcher "${name}" object handler is not a function`
                }
            }
        }
        //construct the watch string
        let paramsString = getParamsString(propInit ? (propInit as ArrowFunction) : watch);
        const bodyString = (propInit ? (propInit as ArrowFunction) : watch)?.getBody().print();
        if (!bodyString) {
            throw `cannot detect body of watcher "${name}" `
        }
        exp = `watch(${name}, ${watch.isAsync ? 'async' : ''} (${paramsString}) => ${bodyString}, {${watchObjectProps.map(p => p.print()).join(',\n')}})`
        if (isImmediateWatch){
            outputMapper.setup
        }
        watchStrings.push(exp)
    })
    const statements = oSetup.addStatements(watchStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper, outputMapper);
    })
}


function getInitializerOfWatchInit(watchNode: Node, watchName: string) {
    const res = (watchNode as PropertyAssignment).getInitializer();
    if (! [ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ObjectLiteralExpression].includes(res.getKind())){
        throw `Found watcher "${watchName}" not in method, arrow function property, function property, or object`
    }
    return res;
}