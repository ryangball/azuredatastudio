/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMainContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostObjectExplorerShape, SqlMainContext, MainThreadObjectExplorerShape } from 'sql/workbench/api/node/sqlExtHost.protocol';
import * as azdata from 'azdata';
import * as vscode from 'vscode';
import { entries } from 'sql/base/common/objects';

export class ExtHostObjectExplorer implements ExtHostObjectExplorerShape {

	private _proxy: MainThreadObjectExplorerShape;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(SqlMainContext.MainThreadObjectExplorer);
	}

	public $getNode(connectionId: string, nodePath?: string): Thenable<azdata.objectexplorer.ObjectExplorerNode> {
		return this._proxy.$getNode(connectionId, nodePath).then(nodeInfo => nodeInfo === undefined ? undefined : new ExtHostObjectExplorerNode(nodeInfo, connectionId, this._proxy));
	}

	public $getActiveConnectionNodes(): Thenable<azdata.objectexplorer.ObjectExplorerNode[]> {
		return this._proxy.$getActiveConnectionNodes().then(results => results.map(result => new ExtHostObjectExplorerNode(result.nodeInfo, result.connectionId, this._proxy)));
	}

	public $findNodes(connectionId: string, type: string, schema: string, name: string, database: string, parentObjectNames: string[]): Thenable<azdata.objectexplorer.ObjectExplorerNode[]> {
		return this._proxy.$findNodes(connectionId, type, schema, name, database, parentObjectNames).then(results => results.map(result => new ExtHostObjectExplorerNode(result, connectionId, this._proxy)));
	}

	public $getNodeActions(connectionId: string, nodePath: string): Thenable<string[]> {
		return this._proxy.$getNodeActions(connectionId, nodePath);
	}

	public $getSessionConnectionProfile(sessionId: string): Thenable<azdata.IConnectionProfile> {
		return this._proxy.$getSessionConnectionProfile(sessionId);
	}
}

class ExtHostObjectExplorerNode implements azdata.objectexplorer.ObjectExplorerNode {
	public connectionId: string;
	public nodePath: string;
	public nodeType: string;
	public nodeSubType: string;
	public nodeStatus: string;
	public label: string;
	public isLeaf: boolean;
	public metadata: azdata.ObjectMetadata;
	public errorMessage: string;

	constructor(nodeInfo: azdata.NodeInfo, connectionId: string, private _proxy: MainThreadObjectExplorerShape) {
		this.getDetailsFromInfo(nodeInfo);
		this.connectionId = connectionId;
	}

	isExpanded(): Thenable<boolean> {
		return this._proxy.$isExpanded(this.connectionId, this.nodePath);
	}

	setExpandedState(expandedState: vscode.TreeItemCollapsibleState): Thenable<void> {
		return this._proxy.$setExpandedState(this.connectionId, this.nodePath, expandedState);
	}

	setSelected(selected: boolean, clearOtherSelections: boolean = undefined): Thenable<void> {
		return this._proxy.$setSelected(this.connectionId, this.nodePath, selected, clearOtherSelections);
	}

	getChildren(): Thenable<azdata.objectexplorer.ObjectExplorerNode[]> {
		return this._proxy.$getChildren(this.connectionId, this.nodePath).then(children => children.map(nodeInfo => new ExtHostObjectExplorerNode(nodeInfo, this.connectionId, this._proxy)));
	}

	getParent(): Thenable<azdata.objectexplorer.ObjectExplorerNode> {
		let parentPathEndIndex = this.nodePath.lastIndexOf('/');
		if (parentPathEndIndex === -1) {
			return Promise.resolve(undefined);
		}
		return this._proxy.$getNode(this.connectionId, this.nodePath.slice(0, parentPathEndIndex)).then(nodeInfo => nodeInfo ? new ExtHostObjectExplorerNode(nodeInfo, this.connectionId, this._proxy) : undefined);
	}

	refresh(): Thenable<void> {
		return this._proxy.$refresh(this.connectionId, this.nodePath).then(nodeInfo => this.getDetailsFromInfo(nodeInfo));
	}

	private getDetailsFromInfo(nodeInfo: azdata.NodeInfo): void {
		this.nodePath = nodeInfo.nodePath;
		this.nodeType = nodeInfo.nodeType;
		this.nodeSubType = nodeInfo.nodeSubType;
		this.nodeStatus = nodeInfo.nodeStatus;
		this.label = nodeInfo.label;
		this.isLeaf = nodeInfo.isLeaf;
		this.metadata = nodeInfo.metadata;
		this.errorMessage = nodeInfo.errorMessage;
	}
}
