import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, ArrowFunction,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import {processThisKeywordAccess} from "../helpers";
import {InputMapper, OutputMapper} from "../models/mapperModel";
import { HandlerPayload } from "../models/payload";

export function mixinsToComposables({inputSource, inputMapper, outputSource, outputMapper}: HandlerPayload) {
    
}