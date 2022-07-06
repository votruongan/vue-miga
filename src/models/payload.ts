import { SourceFile } from "ts-morph";
import { InputMapper, OutputMapper } from "./mapperModel";

export interface HandlerPayload {
    inputSource: SourceFile,
    inputMapper: InputMapper,
    outputSource: SourceFile,
    outputMapper: OutputMapper,
}

export interface ImportPayload {
    defaultImport?: string,
    namedImports?: Set<string>,
    namedImportsArray?: string[],
}