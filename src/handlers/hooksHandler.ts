import { MethodDeclaration, Block } from "ts-morph";
import { AVAILABLE_HOOKS } from "../consts";
import { processThisKeywordAccess, isNodeEmpty} from "../helpers";
import { InputMapper, OutputMapper } from "../models/mapperModel";


export default function handleHooks(inputMapper: InputMapper, outputMapper: OutputMapper){
    const oSetup = outputMapper.setup as MethodDeclaration;
    const iCreated = inputMapper.created as Block;
    const hookStrings = [];
    if (!isNodeEmpty(iCreated)){
        hookStrings.push(`${iCreated.getChildren()[1].getText()}`)
    }
    let exp = '', hookName = '';
    for (let key of Object.keys(inputMapper)) {
        hookName = AVAILABLE_HOOKS.find((h) => h.toLowerCase() === key.toLowerCase())
        if (hookName){
            const body = inputMapper[key]
            if (isNodeEmpty(body))
                continue;
            hookName = `on${hookName}`
            outputMapper.newCompositionImports.push(hookName)
            exp = `${hookName}(() => ${body.print()})`
            hookStrings.push(exp)
        }
    }
    const statements = oSetup.addStatements(hookStrings);

    //clean this keywords from statements
    statements.forEach((statement) => {
        processThisKeywordAccess(statement, inputMapper, outputMapper);
    })
}
