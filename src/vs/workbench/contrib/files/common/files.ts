/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IWorkbenchEditorConfiguration, IEditorIdentifier, IEditorInput, toResource } from 'vs/workbench/common/editor';
import { IFilesConfiguration, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { Event } from 'vs/base/common/event';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainer } from 'vs/workbench/common/views';
import { Schemas } from 'vs/base/common/network';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';
/**
 * Explorer viewlet container.
 */
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);

export interface IEditableData {
	validationMessage: (value: string) => string | null;
	onFinish: (value: string, success: boolean) => void;
}

export interface IExplorerService {
	_serviceBrand: any;
	readonly roots: ExplorerItem[];
	readonly sortOrder: SortOrder;
	readonly onDidChangeRoots: Event<void>;
	readonly onDidChangeItem: Event<ExplorerItem | undefined>;
	readonly onDidChangeEditable: Event<ExplorerItem>;
	readonly onDidSelectItem: Event<{ item?: ExplorerItem, reveal?: boolean }>;
	readonly onDidCopyItems: Event<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }>;

	setEditable(stat: ExplorerItem, data: IEditableData | null): void;
	getEditableData(stat: ExplorerItem): IEditableData | undefined;
	// If undefined is passed checks if any element is currently being edited.
	isEditable(stat: ExplorerItem | undefined): boolean;
	findClosest(resource: URI): ExplorerItem | null;
	refresh(): void;
	setToCopy(stats: ExplorerItem[], cut: boolean): void;
	isCut(stat: ExplorerItem): boolean;

	/**
	 * Selects and reveal the file element provided by the given resource if its found in the explorer. Will try to
	 * resolve the path from the disk in case the explorer is not yet expanded to the file yet.
	 */
	select(resource: URI, reveal?: boolean): Promise<void>;
}
export const IExplorerService = createDecorator<IExplorerService>('explorerService');

/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
const explorerViewletVisibleId = 'explorerViewletVisible';
const filesExplorerFocusId = 'filesExplorerFocus';
const openEditorsVisibleId = 'openEditorsVisible';
const openEditorsFocusId = 'openEditorsFocus';
const explorerViewletFocusId = 'explorerViewletFocus';
const explorerResourceIsFolderId = 'explorerResourceIsFolder';
const explorerResourceReadonly = 'explorerResourceReadonly';
const explorerResourceIsRootId = 'explorerResourceIsRoot';
const explorerResourceCutId = 'explorerResourceCut';

export const ExplorerViewletVisibleContext = new RawContextKey<boolean>(explorerViewletVisibleId, true);
export const ExplorerFolderContext = new RawContextKey<boolean>(explorerResourceIsFolderId, false);
export const ExplorerResourceReadonlyContext = new RawContextKey<boolean>(explorerResourceReadonly, false);
export const ExplorerResourceNotReadonlyContext = ExplorerResourceReadonlyContext.toNegated();
export const ExplorerRootContext = new RawContextKey<boolean>(explorerResourceIsRootId, false);
export const ExplorerResourceCut = new RawContextKey<boolean>(explorerResourceCutId, false);
export const FilesExplorerFocusedContext = new RawContextKey<boolean>(filesExplorerFocusId, true);
export const OpenEditorsVisibleContext = new RawContextKey<boolean>(openEditorsVisibleId, false);
export const OpenEditorsFocusedContext = new RawContextKey<boolean>(openEditorsFocusId, true);
export const ExplorerFocusedContext = new RawContextKey<boolean>(explorerViewletFocusId, true);

export const OpenEditorsVisibleCondition = ContextKeyExpr.has(openEditorsVisibleId);
export const FilesExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(filesExplorerFocusId), ContextKeyExpr.not(InputFocusedContextKey));
export const ExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(explorerViewletFocusId), ContextKeyExpr.not(InputFocusedContextKey));

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';


export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
		confirmDelete: boolean;
		sortOrder: SortOrder;
		decorations: {
			colors: boolean;
			badges: boolean;
		};
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory?: boolean;
}

export const SortOrderConfiguration = {
	DEFAULT: 'default',
	MIXED: 'mixed',
	FILES_FIRST: 'filesFirst',
	TYPE: 'type',
	MODIFIED: 'modified'
};

export type SortOrder = 'default' | 'mixed' | 'filesFirst' | 'type' | 'modified';

export class FileOnDiskContentProvider implements ITextModelContentProvider {
	private fileWatcher: IDisposable;

	constructor(
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService
	) {
	}

	provideTextContent(resource: URI): Promise<ITextModel> {
		const fileOnDiskResource = resource.with({ scheme: Schemas.file });

		// Make sure our file from disk is resolved up to date
		return this.resolveEditorModel(resource).then(codeEditorModel => {

			// Make sure to keep contents on disk up to date when it changes
			if (!this.fileWatcher) {
				this.fileWatcher = this.fileService.onFileChanges(changes => {
					if (changes.contains(fileOnDiskResource, FileChangeType.UPDATED)) {
						this.resolveEditorModel(resource, false /* do not create if missing */); // update model when resource changes
					}
				});

				if (codeEditorModel) {
					const disposeListener = codeEditorModel.onWillDispose(() => {
						disposeListener.dispose();
						this.fileWatcher = dispose(this.fileWatcher);
					});
				}
			}

			return codeEditorModel;
		});
	}

	private resolveEditorModel(resource: URI, createAsNeeded?: true): Promise<ITextModel>;
	private resolveEditorModel(resource: URI, createAsNeeded?: boolean): Promise<ITextModel | null>;
	private resolveEditorModel(resource: URI, createAsNeeded: boolean = true): Promise<ITextModel | null> {
		const fileOnDiskResource = resource.with({ scheme: Schemas.file });

		return this.textFileService.resolveTextContent(fileOnDiskResource).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (codeEditorModel) {
				this.modelService.updateModel(codeEditorModel, content.value);
			} else if (createAsNeeded) {
				const fileOnDiskModel = this.modelService.getModel(fileOnDiskResource);

				let languageSelector: ILanguageSelection;
				if (fileOnDiskModel) {
					languageSelector = this.modeService.create(fileOnDiskModel.getModeId());
				} else {
					languageSelector = this.modeService.createByFilepathOrFirstLine(fileOnDiskResource.fsPath);
				}

				codeEditorModel = this.modelService.createModel(content.value, languageSelector, resource);
			}

			return codeEditorModel;
		});
	}

	dispose(): void {
		this.fileWatcher = dispose(this.fileWatcher);
	}
}

export class OpenEditor implements IEditorIdentifier {

	constructor(private _editor: IEditorInput, private _group: IEditorGroup) {
		// noop
	}

	public get editor() {
		return this._editor;
	}

	public get editorIndex() {
		return this._group.getIndexOfEditor(this.editor);
	}

	public get group() {
		return this._group;
	}

	public get groupId() {
		return this._group.id;
	}

	public getId(): string {
		return `openeditor:${this.groupId}:${this.editorIndex}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this._group.previewEditor === this.editor;
	}

	public isUntitled(): boolean {
		return !!toResource(this.editor, { supportSideBySide: true, filter: Schemas.untitled });
	}

	public isDirty(): boolean {
		return this.editor.isDirty();
	}

	public getResource(): URI | null {
		return toResource(this.editor, { supportSideBySide: true });
	}
}
