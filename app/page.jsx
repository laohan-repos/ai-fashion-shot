'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const nav = [
  ['⌂', '作品'], ['▤', '素材'], ['⚙', '模型'],
];
const workflowSteps = [
  ['模特四视图', '选择模特并生成四联图'],
  ['服装白底图', '合成完整穿搭单品'],
  ['模特穿衣图', '组合人物、服装与场景'],
  ['模特视频', '根据场景生成单个视频'],
];
const clothingWhitePrompt = '根据全部参考图片生成一张 3:4 竖版的完整服装搭配白底图。每张参考图中的主体服装或时尚单品都必须在最终图片中出现一次，不能遗漏、重复，也不能把不同服装融合成新款。严格保持每件单品原有的品类、版型、长度、比例、颜色、面料纹理、图案、领型、袖型、纽扣、拉链、口袋、缝线和装饰细节，不得改款或增加不存在的设计。去除原图中的人物、皮肤、手、衣架、模特轮廓、原背景和无关物品。将所有单品按照一套完整穿搭自然排列：上衣位于上方，下装位于下方，鞋子位于底部，配饰放在侧边；各单品相互独立、间距均匀、不得遮挡，整体居中且全部完整入镜。使用纯白无缝背景（#FFFFFF）、均匀柔和的商业摄影光线和轻微自然阴影，边缘清晰，颜色准确。只输出这一张服装搭配白底图，不要模特、人体、文字、标题、尺寸线、水印或装饰边框。';
const dressedModelPrompt = '使用第一张参考图中的模特作为唯一人物身份参考，使用第二张参考图中的整套服装作为唯一穿搭参考，生成一张 3:4 竖版的全身模特穿衣图。必须严格保持模特原有的五官、脸型、发型、发色、肤色、年龄感、身高和身体比例，不得更换人物。让模特准确穿上服装参考图中的全部单品，严格还原每件服装的品类、版型、长度、颜色、面料纹理、图案、领型、袖型、纽扣、拉链、口袋、缝线和装饰细节，不得遗漏、改款、融合或增加其他服装。只生成一位模特，正面自然站立，双脚完整可见，从头顶到鞋底完整入镜。硬性构图要求：模特必须一只手拿着一部竖屏智能手机并举到面部前方，手机只遮挡约 20% 的面部面积，脸部其余约 80% 必须可见，不能遮住整张脸；手机、手掌和手臂不能遮挡服装主体、领口、胸前设计和腰线。只允许出现一部手机，手指结构自然清晰，人物姿势稳定，肢体轮廓明确，便于后续 Seedance 视频生成。人物必须真实融入指定场景，环境光线、人物受光、阴影、透视和景深保持一致，画面呈现高质量时尚摄影效果。不要四联图，不要重复人物，不要服装平铺，不要衣架、文字、水印、标题或边框。';
const dressedScenes = ['高级室内', '城市街拍', '精品咖啡馆', '商场橱窗', '极简展厅', '自定义场景'];

function SelectPill({ children, active, onClick }) {
  return <button className={`pill ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>;
}

function MaterialLibrary() {
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [prompt, setPrompt] = useState('年轻亚洲女性模特，全身站姿，自然妆容，白色摄影棚，柔和商业布光');
  const [imageRatio, setImageRatio] = useState('9:16');
  const [imageCount, setImageCount] = useState(1);
  const [generatingModel, setGeneratingModel] = useState(false);
  const [clothingPrompt, setClothingPrompt] = useState('一套米白色轻奢通勤女装，包含西装外套、吊带内搭、高腰直筒裤和简洁高跟鞋，款式、颜色和面料细节清晰，纯白背景，无模特。');
  const [clothingImageRatio, setClothingImageRatio] = useState('9:16');
  const [clothingImageCount, setClothingImageCount] = useState(1);
  const [generatingClothing, setGeneratingClothing] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editSize, setEditSize] = useState('1024x1536');
  const [editingImage, setEditingImage] = useState(false);
  const [assetVersions, setAssetVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [assetMenuId, setAssetMenuId] = useState(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(false);
  const [notice, setNotice] = useState('');
  const [modelAssets, setModelAssets] = useState([]);
  const [clothingAssets, setClothingAssets] = useState([]);
  const [uploadingType, setUploadingType] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState('create');
  const [targetGroup, setTargetGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const activeGroup = groups.find(group => group.id === activeGroupId);

  async function loadGroups() {
    const response = await fetch('/api/assets/groups?type=%E6%90%AD%E9%85%8D', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) {
      const nextGroups = data.groups || [];
      setGroups(nextGroups);
      setActiveGroupId(current => nextGroups.some(group => group.id === current) ? current : (nextGroups[0]?.id || null));
    }
  }

  async function loadAssets(groupId = activeGroupId) {
    if (!groupId) { setModelAssets([]); setClothingAssets([]); return; }
    const [modelResponse, clothingResponse] = await Promise.all([
      fetch(`/api/assets?groupId=${groupId}&type=%E6%A8%A1%E7%89%B9`, { cache: 'no-store' }),
      fetch(`/api/assets?groupId=${groupId}&type=%E6%9C%8D%E8%A3%85`, { cache: 'no-store' }),
    ]);
    const [modelData, clothingData] = await Promise.all([modelResponse.json(), clothingResponse.json()]);
    if (modelResponse.ok) setModelAssets(modelData.assets || []);
    if (clothingResponse.ok) setClothingAssets(clothingData.assets || []);
  }

  useEffect(() => {
    loadGroups().catch(() => setNotice('读取搭配分组失败'));
  }, []);

  useEffect(() => {
    loadAssets(activeGroupId).catch(() => setNotice('读取搭配素材失败'));
  }, [activeGroupId]);

  function addGroup() {
    setGroupDialogMode('create');
    setTargetGroup(null);
    setNewGroupName('');
    setGroupError('');
    setGroupDialogOpen(true);
  }

  function editGroup(group) {
    setGroupDialogMode('edit');
    setTargetGroup(group);
    setNewGroupName(group.name);
    setGroupError('');
    setGroupDialogOpen(true);
  }

  function requestDeleteGroup(group) {
    setGroupDialogMode('delete');
    setTargetGroup(group);
    setGroupError('');
    setGroupDialogOpen(true);
  }

  async function submitGroup(event) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) { setGroupError('请输入分组名称'); return; }
    if (groups.some(group => group.name === name && group.id !== targetGroup?.id)) { setGroupError('该分组名称已存在'); return; }
    try {
      const response = await fetch('/api/assets/groups', { method: groupDialogMode === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: targetGroup?.id, assetType: '搭配', name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存分组失败');
      await loadGroups();
      setActiveGroupId(data.group.id);
      setGroupDialogOpen(false);
    } catch (error) {
      setGroupError(error.message);
    }
  }

  async function deleteGroup() {
    try {
      const response = await fetch('/api/assets/groups', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: targetGroup.id, assetType: '搭配' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除分组失败');
      if (activeGroupId === targetGroup.id) { setActiveGroupId(null); setModelAssets([]); setClothingAssets([]); }
      await loadGroups();
      setGroupDialogOpen(false);
    } catch (error) {
      setGroupError(error.message);
    }
  }

  async function uploadFiles(event, assetType) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!activeGroupId || files.length === 0) return;
    setUploadingType(assetType);
    setNotice(`正在保存${assetType}图片…`);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('groupId', String(activeGroupId));
        form.append('assetType', assetType);
        const response = await fetch('/api/assets', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '图片上传失败');
      }
      await Promise.all([loadAssets(), loadGroups()]);
      setNotice(`${assetType}图片已加入当前搭配`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploadingType('');
      setTimeout(() => setNotice(''), 2600);
    }
  }

  async function generateAssetImage(assetType) {
    const isModelAsset = assetType === '模特';
    const assetPrompt = isModelAsset ? prompt : clothingPrompt;
    const assetRatio = isModelAsset ? imageRatio : clothingImageRatio;
    const assetCount = isModelAsset ? imageCount : clothingImageCount;
    if (!activeGroupId || !assetPrompt.trim()) return;
    if (isModelAsset) setGeneratingModel(true);
    else setGeneratingClothing(true);
    setNotice(`GPT Image 2 正在生成${assetType}照片…`);
    try {
      const response = await fetch('/api/assets/generate-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: activeGroupId, assetType, prompt: assetPrompt, ratio: assetRatio, count: assetCount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `生成${assetType}照片失败`);
      await Promise.all([loadAssets(), loadGroups()]);
      setNotice(`已生成 ${data.assets.length} 张${assetType}照片，并保存到当前搭配`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      if (isModelAsset) setGeneratingModel(false);
      else setGeneratingClothing(false);
      setTimeout(() => setNotice(''), 5000);
    }
  }

  async function editAssetImage() {
    if (!previewAsset || !editPrompt.trim()) return;
    setEditingImage(true);
    setNotice('GPT Image 2 正在编辑图片…');
    try {
      const response = await fetch(`/api/assets/${previewAsset.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: editPrompt, size: editSize, sourceVersionId: selectedVersion?.id ?? 'original' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '图片编辑失败');
      setEditPrompt('');
      await Promise.all([loadAssets(), loadGroups()]);
      const versions = await loadAssetVersions(previewAsset.id);
      setSelectedVersion(versions.find(version => version.id === data.version.id) || versions[versions.length - 1]);
      setNotice('编辑完成，新图片已保存到当前分组');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setEditingImage(false);
      setTimeout(() => setNotice(''), 5000);
    }
  }

  async function loadAssetVersions(assetId) {
    const response = await fetch(`/api/assets/${assetId}/versions`, { cache: 'no-store' });
    const data = await response.json();
    const versions = response.ok ? (data.versions || []) : [];
    setAssetVersions(versions);
    return versions;
  }

  async function openAssetEditor(asset) {
    setPreviewAsset(asset);
    setEditPrompt('');
    setAssetVersions([]);
    setSelectedVersion(null);
    const versions = await loadAssetVersions(asset.id);
    setSelectedVersion(versions[versions.length - 1] || null);
  }

  async function deleteMaterialAsset() {
    if (!deleteAssetTarget) return;
    setDeletingAsset(true);
    try {
      const response = await fetch('/api/assets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteAssetTarget.id }) });
      const data = await response.json();
      if (!response.ok || !data.deleted) throw new Error(data.error || '删除素材失败');
      if (previewAsset?.id === deleteAssetTarget.id) setPreviewAsset(null);
      setDeleteAssetTarget(null);
      await Promise.all([loadAssets(), loadGroups()]);
      setNotice(`${deleteAssetTarget.assetType}图片及其所有版本已删除`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeletingAsset(false);
      setTimeout(() => setNotice(''), 3000);
    }
  }

  function renderAssetCollection(assetType, assets) {
    const isModelAsset = assetType === '模特';
    const isUploading = uploadingType === assetType;
    const isGenerating = isModelAsset ? generatingModel : generatingClothing;
    const generationPrompt = isModelAsset ? prompt : clothingPrompt;
    const generationRatio = isModelAsset ? imageRatio : clothingImageRatio;
    const generationCount = isModelAsset ? imageCount : clothingImageCount;
    return <section className={`pairing-asset-section ${isModelAsset ? 'model-section' : 'clothing-section'}`}>
      <div className="pairing-section-heading"><div><span className={isModelAsset ? 'model' : 'clothing'}>{isModelAsset ? '1' : '2'}</span><div><h2>{isModelAsset ? '添加模特照片' : '添加服装照片'}</h2><p>{isModelAsset ? '上传同一位模特的照片，正面全身照效果最好' : '上传这套穿搭中的衣服、裤子、鞋和配饰'}</p></div></div><b className={assets.length > 0 ? 'ready' : ''}>{assets.length > 0 ? `已添加 ${assets.length} 张` : '还未添加'}</b></div>
      <label className={`simple-upload-button ${isUploading ? 'uploading' : ''}`}><input type="file" accept="image/*" multiple disabled={Boolean(uploadingType)} onChange={event => uploadFiles(event, assetType)} /><span>{isUploading ? '…' : '↑'}</span><div><b>{isUploading ? '正在保存…' : `选择${assetType}照片`}</b><small>支持 JPG、PNG、WEBP，可一次选多张</small></div></label>
      {assets.length > 0 && <div className="library-grid pairing-grid">{assets.map(asset => <article className="library-card" key={asset.id}><div className="library-image clickable" onClick={() => openAssetEditor(asset)}><img src={asset.imageUrl} alt={asset.name} />{asset.versionCount > 0 && <span className="version-badge">{asset.versionCount + 1} 个版本</span>}<button aria-label="更多操作" onClick={event => { event.stopPropagation(); setAssetMenuId(assetMenuId === asset.id ? null : asset.id); }}>•••</button>{assetMenuId === asset.id && <div className="asset-card-menu" onClick={event => event.stopPropagation()}><button onClick={() => { setDeleteAssetTarget(asset); setAssetMenuId(null); }}>删除照片</button></div>}</div><div className="library-name"><b>{asset.name}</b><span>点击图片可编辑</span></div></article>)}</div>}
      <details className="ai-model-helper"><summary><span>✦</span><div><b>{isModelAsset ? '没有合适的模特照片？' : '没有合适的服装照片？'}</b><small>{isModelAsset ? '输入要求，让 AI 生成一位模特' : '描述款式、颜色和面料，让 AI 生成服装'}</small></div><i>展开</i></summary><div className="ai-model-maker simple"><div className="ai-maker-body"><label>{isModelAsset ? '描述你想要的模特' : '描述你想要的服装'}<textarea value={generationPrompt} onChange={event => isModelAsset ? setPrompt(event.target.value) : setClothingPrompt(event.target.value)} /></label><div className="ai-options"><label>照片比例<select value={generationRatio} onChange={event => isModelAsset ? setImageRatio(event.target.value) : setClothingImageRatio(event.target.value)}><option value="9:16">9:16 竖版</option><option value="1:1">1:1 方图</option><option value="16:9">16:9 横版</option></select></label><label>生成数量<select value={generationCount} onChange={event => isModelAsset ? setImageCount(Number(event.target.value)) : setClothingImageCount(Number(event.target.value))}><option value="1">1 张</option><option value="2">2 张</option><option value="4">4 张</option></select></label><button type="button" disabled={isGenerating || !generationPrompt.trim()} onClick={() => generateAssetImage(assetType)}>{isGenerating ? '正在生成…' : `生成${assetType}照片`}</button></div></div></div></details>
    </section>;
  }

  return <section className="library-view">
    <div className="pairing-library-heading"><div><h1>模特和服装</h1><span>先建立一组搭配，再放入一位模特和她要穿的一套衣服。</span></div><button onClick={addGroup}>＋ 新建搭配</button></div>
    <div className="library-layout">
      <aside className="group-panel"><div className="group-title"><div><b>我的搭配</b><span>{groups.length} 组</span></div><button aria-label="新建搭配" onClick={addGroup}>＋</button></div>{groups.length === 0 && <div className="no-groups"><span>□</span><p>还没有搭配</p><button onClick={addGroup}>创建第一组搭配</button></div>}{groups.map(group => { const hasModel = (group.modelCount || 0) > 0; const hasClothing = (group.clothingCount || 0) > 0; const status = hasModel && hasClothing ? '已备齐' : !hasModel && !hasClothing ? '待添加' : hasModel ? '缺服装' : '缺模特'; return <div className={`group-row ${activeGroupId === group.id ? 'active' : ''}`} key={group.id}><button className="group-select" onClick={() => setActiveGroupId(group.id)}><span className="group-pair-icon">♡</span><span className="group-pair-copy"><b>{group.name}</b><small className={hasModel && hasClothing ? 'ready' : ''}>{status}</small></span></button><div className="group-actions"><button title="重命名" onClick={() => editGroup(group)}>✎</button><button title="删除" onClick={() => requestDeleteGroup(group)}>×</button></div></div>; })}</aside>
      <div className="library-main">
        {!activeGroup ? <div className="group-required"><div>1</div><h2>先创建一组搭配</h2><p>给这组搭配起个名字，然后上传模特照片和服装照片。</p><button onClick={addGroup}>＋ 新建搭配</button></div> : <><div className="active-pairing-title"><div><small>正在编辑</small><h2>{activeGroup.name}</h2></div><div className={`pairing-ready-state ${modelAssets.length > 0 && clothingAssets.length > 0 ? 'ready' : ''}`}><i>{modelAssets.length > 0 && clothingAssets.length > 0 ? '✓' : '!'}</i><span><b>{modelAssets.length > 0 && clothingAssets.length > 0 ? '搭配已备齐' : '还需补充照片'}</b><small>{modelAssets.length > 0 && clothingAssets.length > 0 ? '可用于新建作品和批量生成' : `${modelAssets.length === 0 ? '请添加模特照片' : ''}${modelAssets.length === 0 && clothingAssets.length === 0 ? '、' : ''}${clothingAssets.length === 0 ? '请添加服装照片' : ''}`}</small></span></div></div><div className="pairing-simple-guide"><span className={modelAssets.length > 0 ? 'done' : 'active'}><i>{modelAssets.length > 0 ? '✓' : '1'}</i>添加模特</span><b>→</b><span className={clothingAssets.length > 0 ? 'done' : modelAssets.length > 0 ? 'active' : ''}><i>{clothingAssets.length > 0 ? '✓' : '2'}</i>添加服装</span><b>→</b><span className={modelAssets.length > 0 && clothingAssets.length > 0 ? 'done' : ''}><i>{modelAssets.length > 0 && clothingAssets.length > 0 ? '✓' : '3'}</i>完成</span></div><div className="pairing-assets">{renderAssetCollection('模特', modelAssets)}{renderAssetCollection('服装', clothingAssets)}</div></>}
      </div>
    </div>
    {notice && <div className="library-notice">{notice}</div>}
    {previewAsset && <div className="image-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !editingImage) setPreviewAsset(null); }}><div className="image-editor-modal"><button className="editor-close" disabled={editingImage} onClick={() => setPreviewAsset(null)}>×</button><div className="editor-preview"><img src={selectedVersion?.imageUrl || previewAsset.imageUrl} alt={previewAsset.name} />{assetVersions.length > 0 && <div className="version-strip">{assetVersions.map(version => <button key={version.id || 'original'} className={(selectedVersion?.id ?? null) === version.id ? 'active' : ''} onClick={() => setSelectedVersion(version)}><img src={version.imageUrl} alt={version.label} /><span>{version.label}</span></button>)}</div>}</div><div className="editor-panel"><div><small>GPT Image 2 图生图 · {previewAsset.assetType} · {selectedVersion?.label || '原图'}</small><h2>{previewAsset.name}</h2><p>原图不会被覆盖，每次修改都会保存为新版本，可选择任一版本继续编辑。</p></div><label>修改提示词<textarea autoFocus value={editPrompt} onChange={event => setEditPrompt(event.target.value)} placeholder={previewAsset.assetType === '服装' ? '例如：保持服装品类、版型和细节不变，将颜色改为米白色，使用纯白背景和柔和商业布光。' : '例如：保持人物、姿势和构图不变，将背景改为简洁的白色摄影棚。'} /></label>{previewAsset.assetType === '服装' ? <div className="edit-prompt-examples"><button onClick={() => setEditPrompt('保持服装品类、版型和所有设计细节不变，只将颜色改为米白色。')}>修改颜色</button><button onClick={() => setEditPrompt('保持服装版型、颜色和细节不变，将面料替换为细腻有质感的真丝。')}>替换面料</button><button onClick={() => setEditPrompt('保持服装款式和颜色不变，去除无关背景，改为纯白商业摄影背景，优化光线和面料细节。')}>优化展示</button></div> : <div className="edit-prompt-examples"><button onClick={() => setEditPrompt('保持人物、姿势和构图不变，更换服装款式与颜色。')}>更换服装</button><button onClick={() => setEditPrompt('保持人物与服装不变，将背景改为简洁的白色摄影棚。')}>更换背景</button><button onClick={() => setEditPrompt('保持人物和服装不变，优化光线、肤色与画面质感。')}>优化质感</button></div>}<label>输出尺寸<select value={editSize} onChange={event => setEditSize(event.target.value)}><option value="1024x1536">1024×1536 竖版</option><option value="1024x1024">1024×1024 方形</option><option value="1536x1024">1536×1024 横版</option></select></label><div className="editor-actions"><button onClick={() => setPreviewAsset(null)} disabled={editingImage}>取消</button><button onClick={editAssetImage} disabled={editingImage || !editPrompt.trim()}>{editingImage ? '图生图编辑中…' : '✦ 生成新版本'}</button></div></div></div></div>}
    {deleteAssetTarget && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deletingAsset) setDeleteAssetTarget(null); }}><div className="group-dialog delete-dialog"><div className="dialog-icon">!</div><div className="dialog-copy"><h2>删除{deleteAssetTarget.assetType}图片</h2><p>确定删除“{deleteAssetTarget.name}”吗？原图和 {deleteAssetTarget.versionCount || 0} 个编辑版本都会被永久删除。</p></div><div className="delete-asset-preview"><img src={deleteAssetTarget.imageUrl} alt={deleteAssetTarget.name} /></div><div className="dialog-actions"><button disabled={deletingAsset} onClick={() => setDeleteAssetTarget(null)}>取消</button><button className="danger-button" disabled={deletingAsset} onClick={deleteMaterialAsset}>{deletingAsset ? '删除中…' : '确认删除'}</button></div></div></div>}
    {groupDialogOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setGroupDialogOpen(false); }}><form className={`group-dialog ${groupDialogMode === 'delete' ? 'delete-dialog' : ''}`} onSubmit={submitGroup}><div className="dialog-icon">{groupDialogMode === 'delete' ? '!' : '□'}</div><div className="dialog-copy"><h2>{groupDialogMode === 'create' ? '新建搭配' : groupDialogMode === 'edit' ? '重命名搭配' : '删除搭配'}</h2><p>{groupDialogMode === 'delete' ? `删除“${targetGroup?.name}”后，其中的模特和服装图片也会一并删除，此操作无法撤销。` : groupDialogMode === 'edit' ? '修改名称不会影响搭配中的模特和服装素材。' : '创建后，把同一位模特和她对应的一套服装放在一起。'}</p></div>{groupDialogMode !== 'delete' && <label>搭配名称<input autoFocus maxLength={24} value={newGroupName} onChange={event => { setNewGroupName(event.target.value); setGroupError(''); }} placeholder="例如：亚洲女模特 × 白色通勤套装" /></label>}{groupError && <span className="group-error">{groupError}</span>}<div className="dialog-actions"><button type="button" onClick={() => setGroupDialogOpen(false)}>取消</button>{groupDialogMode === 'delete' ? <button className="danger-button" type="button" onClick={deleteGroup}>确认删除</button> : <button type="submit">{groupDialogMode === 'edit' ? '保存修改' : '创建搭配'}</button>}</div></form></div>}
  </section>;
}

function ModelFourViewStep({ projectKey, groupId, setGroupId, groupLocked, onFourViewGenerated }) {
  const [groups, setGroups] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [views, setViews] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('根据全部参考图片提取并锁定同一个人物身份，生成一张横向四视图合成图。画面必须划分为四个等宽竖向面板，从左到右依次为：正面、左侧面、右侧面、背面。四个面板中必须是同一个人，严格保持五官、脸型、发型、发色、肤色、年龄感、身高比例、肩宽、腰臀比例和腿型一致。参考图片只用于确认人物身份与体型，忽略背景、光线和服装差异。模特统一穿无图案的纯黑色贴身短袖上衣、纯黑色贴身及膝短裤和简洁白色平底鞋，不佩戴首饰，不携带包袋。四个视图都自然站立、双手自然下垂、双脚平行、表情自然放松；相机高度、焦距、人物尺寸、脚底基线和头顶高度完全一致。纯白无缝摄影棚背景，均匀柔和布光，每个视图都从头顶到鞋底完整入镜，不裁切身体。只输出这一张四联视图合成图，不要额外人物、文字、标题、水印或装饰边框。');
  const [sheetEditorOpen, setSheetEditorOpen] = useState(false);
  const [sheetVersions, setSheetVersions] = useState([]);
  const [selectedSheetVersion, setSelectedSheetVersion] = useState(null);
  const [sheetEditPrompt, setSheetEditPrompt] = useState('');
  const [editingSheet, setEditingSheet] = useState(false);
  const [confirmingSheetDelete, setConfirmingSheetDelete] = useState(false);
  const [deletingSheetVersion, setDeletingSheetVersion] = useState(false);
  const sheetView = views.find(view => view.viewType === 'sheet');

  async function loadFourViewResult() {
    const response = await fetch(`/api/project/model-four-view?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' });
    const data = await response.json();
    setViews(data.views || []);
    return data.views || [];
  }

  useEffect(() => {
    fetch('/api/assets/groups?type=%E6%90%AD%E9%85%8D', { cache: 'no-store' }).then(response => response.json()).then(data => { const nextGroups = data.groups || []; setGroups(nextGroups); if (!nextGroups.some(group => String(group.id) === String(groupId))) setGroupId(nextGroups[0] ? String(nextGroups[0].id) : ''); }).catch(() => setMessage('读取搭配分组失败'));
    loadFourViewResult().catch(() => {});
  }, [projectKey]);

  useEffect(() => {
    setSelectedIds([]);
    if (!groupId) { setAssets([]); return; }
    fetch(`/api/assets?groupId=${groupId}&type=%E6%A8%A1%E7%89%B9`, { cache: 'no-store' }).then(response => response.json()).then(data => setAssets(data.assets || [])).catch(() => setMessage('读取模特图片失败'));
  }, [groupId]);

  function toggleAsset(id) {
    if (selectedIds.includes(id)) { setSelectedIds(selectedIds.filter(item => item !== id)); return; }
    if (selectedIds.length >= 4) { setMessage('最多选择 4 张参考图'); setTimeout(() => setMessage(''), 2200); return; }
    setSelectedIds([...selectedIds, id]);
  }

  async function generateFourViews() {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    setMessage('正在生成一张模特四视图合成图…');
    try {
      const response = await fetch('/api/project/model-four-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectKey, assetIds: selectedIds, customPrompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '四视图生成失败');
      setViews(data.views || []);
      setMessage('四视图已生成并保存到 SQLite');
      onFourViewGenerated?.();
      window.dispatchEvent(new Event('project-sources-updated'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  async function openSheetEditor() {
    setSheetEditorOpen(true);
    setSheetEditPrompt('');
    setConfirmingSheetDelete(false);
    const response = await fetch(`/api/project/model-four-view/versions?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' });
    const data = await response.json();
    const versions = response.ok ? (data.versions || []) : [];
    setSheetVersions(versions);
    setSelectedSheetVersion(versions[versions.length - 1] || null);
  }

  async function editFourViewSheet() {
    if (!sheetEditPrompt.trim()) return;
    setEditingSheet(true);
    setMessage('正在编辑四视图合成图…');
    try {
      const response = await fetch('/api/project/model-four-view/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectKey, prompt: sheetEditPrompt, sourceVersionId: selectedSheetVersion?.id ?? 'original' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '四视图编辑失败');
      const versionsResponse = await fetch(`/api/project/model-four-view/versions?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' });
      const versionsData = await versionsResponse.json();
      const versions = versionsData.versions || [];
      setSheetVersions(versions);
      setSelectedSheetVersion(versions.find(version => version.id === data.version.id) || versions[versions.length - 1]);
      setSheetEditPrompt('');
      await loadFourViewResult();
      setMessage('新版本已保存到 SQLite');
      window.dispatchEvent(new Event('project-sources-updated'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setEditingSheet(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  async function deleteFourViewVersion() {
    if (!selectedSheetVersion?.id) return;
    const currentIndex = sheetVersions.findIndex(version => version.id === selectedSheetVersion.id);
    setDeletingSheetVersion(true);
    try {
      const response = await fetch(`/api/project/model-four-view/versions/${selectedSheetVersion.id}?projectKey=${encodeURIComponent(projectKey)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除版本失败');
      const versionsResponse = await fetch(`/api/project/model-four-view/versions?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' });
      const versionsData = await versionsResponse.json();
      const versions = versionsData.versions || [];
      setSheetVersions(versions);
      setSelectedSheetVersion(versions[Math.max(0, Math.min(currentIndex - 1, versions.length - 1))] || null);
      setConfirmingSheetDelete(false);
      await loadFourViewResult();
      setMessage('版本已从 SQLite 删除');
      window.dispatchEvent(new Event('project-sources-updated'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDeletingSheetVersion(false);
      setTimeout(() => setMessage(''), 4000);
    }
  }

  return <section className="panel four-view-step"><div className="four-view-heading"><div><h2>1. 生成模特四视图</h2><p>从当前搭配中选择同一模特的参考图片，生成正面、左侧、右侧、背面四联图。</p></div><span>GPT Image 2 图生图</span></div><div className="reference-picker"><label>选择搭配分组<select value={groupId} disabled={Boolean(sheetView) || groupLocked} onChange={event => setGroupId(event.target.value)}><option value="">请选择搭配</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}（{group.modelCount || 0} 张模特图 / {group.clothingCount || 0} 张服装图）</option>)}</select>{(sheetView || groupLocked) && <small className="group-lock-hint">四视图已生成，当前素材组已锁定，不可更改。</small>}</label><div className="reference-summary"><b>选择同一模特参考图</b><span>已选 {selectedIds.length}/4 张</span></div>{!groupId ? <div className="reference-empty">请先选择一个搭配分组</div> : assets.length === 0 ? <div className="reference-empty">该搭配还没有模特图片</div> : <div className="reference-grid">{assets.map(asset => <button key={asset.id} className={selectedIds.includes(asset.id) ? 'selected' : ''} onClick={() => toggleAsset(asset.id)}><img src={asset.imageUrl} alt={asset.name} /><i>{selectedIds.includes(asset.id) ? '✓' : '＋'}</i><span>{asset.name}</span></button>)}</div>}<div className="four-view-actions"><button className="four-view-prompt-button" onClick={() => setPromptDialogOpen(true)}>✎ 提示词</button><button className="generate-four-view" disabled={selectedIds.length === 0 || generating} onClick={generateFourViews}>{generating ? '四视图生成中…' : '✦ 生成模特四视图'}</button></div></div>{sheetView && <div className="four-view-results four-view-sheet"><div className="result-title"><b>模特四视图合成图</b><span>从左到右：正面 / 左侧 / 右侧 / 背面</span></div><figure className="editable-sheet" onClick={openSheetEditor}><img src={`${sheetView.imageUrl}&t=${encodeURIComponent(sheetView.updatedAt || '')}`} alt="模特四视图合成图" />{sheetView.versionCount > 0 && <span>{sheetView.versionCount + 1} 个版本</span>}<i>点击放大并编辑</i></figure></div>}{message && <div className="four-view-message">{message}</div>}{promptDialogOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPromptDialogOpen(false); }}><div className="group-dialog four-view-prompt-dialog"><div className="dialog-icon">✎</div><div className="dialog-copy"><h2>四视图合成图提示词</h2><p>一次生成一张包含正面、左侧、右侧和背面的横向四联图。</p></div><label>生成提示词<textarea autoFocus maxLength={1000} value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} placeholder="输入四视图的人物、背景、光线和排版要求" /></label><div className="prompt-character-count">{customPrompt.length}/1000</div><div className="dialog-actions"><button onClick={() => setCustomPrompt('')}>清空</button><button onClick={() => setPromptDialogOpen(false)}>保存提示词</button></div></div></div>}{sheetEditorOpen && <div className="image-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !editingSheet) setSheetEditorOpen(false); }}><div className="image-editor-modal four-sheet-editor-modal"><button className="editor-close" disabled={editingSheet} onClick={() => setSheetEditorOpen(false)}>×</button><div className="editor-preview"><img src={selectedSheetVersion?.imageUrl || sheetView.imageUrl} alt="模特四视图" />{sheetVersions.length > 0 && <div className="version-strip">{sheetVersions.map(version => <button key={version.id || 'original'} className={(selectedSheetVersion?.id ?? null) === version.id ? 'active' : ''} onClick={() => { setSelectedSheetVersion(version); setConfirmingSheetDelete(false); }}><img src={version.imageUrl} alt={version.label} /><span>{version.label}</span></button>)}</div>}</div><div className="editor-panel"><div><small>GPT Image 2 图生图 · {selectedSheetVersion?.label || '原图'}</small><h2>编辑模特四视图</h2><p>选择任意版本继续编辑。系统会保持四联图结构和人物一致性。</p>{selectedSheetVersion?.id && <button className="version-delete-trigger" disabled={editingSheet || deletingSheetVersion} onClick={() => setConfirmingSheetDelete(true)}>删除当前版本</button>}</div><label>修改提示词<textarea autoFocus value={sheetEditPrompt} onChange={event => setSheetEditPrompt(event.target.value)} placeholder="例如：保持四视图结构和人物完全一致，将基础服改为浅灰色。" /></label><div className="edit-prompt-examples"><button onClick={() => setSheetEditPrompt('保持四视图结构和人物身份不变，将基础服统一改为浅灰色贴身款式。')}>修改基础服</button><button onClick={() => setSheetEditPrompt('保持人物和四视图结构不变，统一优化肤色、光线和画面清晰度。')}>优化质感</button><button onClick={() => setSheetEditPrompt('修正四个视图的人物比例，使头顶高度、脚底基线和身体尺寸完全一致。')}>统一比例</button></div>{confirmingSheetDelete && <div className="version-delete-confirm"><span>确定删除“{selectedSheetVersion?.label}”？删除后无法恢复。</span><div><button disabled={deletingSheetVersion} onClick={() => setConfirmingSheetDelete(false)}>取消</button><button disabled={deletingSheetVersion} onClick={deleteFourViewVersion}>{deletingSheetVersion ? '删除中…' : '确认删除'}</button></div></div>}<div className="editor-actions"><button disabled={editingSheet} onClick={() => setSheetEditorOpen(false)}>取消</button><button disabled={editingSheet || !sheetEditPrompt.trim()} onClick={editFourViewSheet}>{editingSheet ? '图生图编辑中…' : '✦ 生成新版本'}</button></div></div></div></div>}</section>;
}

function ClothingWhiteBackgroundStep({ projectKey, groupId, setGroupId, groupLocked }) {
  const [groups, setGroups] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [images, setImages] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(clothingWhitePrompt);

  async function loadResults() {
    const response = await fetch(`/api/project/clothing-white-background?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setImages(data.images || []);
  }

  useEffect(() => {
    fetch('/api/assets/groups?type=%E6%90%AD%E9%85%8D', { cache: 'no-store' }).then(response => response.json()).then(data => { const nextGroups = data.groups || []; setGroups(nextGroups); if (!nextGroups.some(group => String(group.id) === String(groupId))) setGroupId(nextGroups[0] ? String(nextGroups[0].id) : ''); }).catch(() => setMessage('读取搭配分组失败'));
    loadResults().catch(() => {});
  }, [projectKey]);

  useEffect(() => {
    setSelectedIds([]);
    if (!groupId) { setAssets([]); return; }
    fetch(`/api/assets?groupId=${groupId}&type=%E6%9C%8D%E8%A3%85`, { cache: 'no-store' }).then(response => response.json()).then(data => setAssets(data.assets || [])).catch(() => setMessage('读取服装素材失败'));
  }, [groupId]);

  function toggleAsset(id) {
    if (selectedIds.includes(id)) { setSelectedIds(selectedIds.filter(item => item !== id)); return; }
    if (selectedIds.length >= 6) { setMessage('最多选择 6 张服装参考图'); setTimeout(() => setMessage(''), 2200); return; }
    setSelectedIds([...selectedIds, id]);
  }

  async function generateWhiteImages() {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    setMessage(`正在将 ${selectedIds.length} 张服装图合成为一张白底图…`);
    try {
      const response = await fetch('/api/project/clothing-white-background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectKey, assetIds: selectedIds, customPrompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '服装白底图生成失败');
      setImages(data.images || []);
      setMessage('3:4 服装白底合成图已保存到 SQLite');
      window.dispatchEvent(new Event('project-sources-updated'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  return <section className="panel clothing-white-step">
    <div className="four-view-heading"><div><h2>2. 生成服装白底图</h2><p>选择多张服装图片，合成为一张 3:4 竖版白底搭配图。</p></div><span>GPT Image 2 图生图</span></div>
    <div className="reference-picker">
      <label>当前搭配分组<select value={groupId} disabled={groupLocked} onChange={event => setGroupId(event.target.value)}><option value="">请选择搭配</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}（{group.modelCount || 0} 张模特图 / {group.clothingCount || 0} 张服装图）</option>)}</select>{groupLocked && <small className="group-lock-hint">四视图已生成，当前素材组已锁定。</small>}</label>
      <div className="reference-summary"><b>选择需要合成的服装</b><span>已选 {selectedIds.length}/6 张</span></div>
      {!groupId ? <div className="reference-empty">请先选择一个搭配分组</div> : assets.length === 0 ? <div className="reference-empty">该搭配还没有服装图片</div> : <div className="reference-grid clothing-reference-grid">{assets.map(asset => <button key={asset.id} className={selectedIds.includes(asset.id) ? 'selected' : ''} onClick={() => toggleAsset(asset.id)}><img src={asset.imageUrl} alt={asset.name} /><i>{selectedIds.includes(asset.id) ? '✓' : '＋'}</i><span>{asset.name}</span></button>)}</div>}
      <div className="four-view-actions"><button className="four-view-prompt-button" onClick={() => setPromptDialogOpen(true)}>✎ 提示词</button><button className="generate-four-view" disabled={selectedIds.length === 0 || generating} onClick={generateWhiteImages}>{generating ? '合成图生成中…' : '✦ 生成服装白底图'}</button></div>
    </div>
    {images.length > 0 && <div className="clothing-white-results"><div className="result-title"><b>服装白底合成图</b><span>3:4 竖版</span></div><div>{images.map(image => <figure key={image.id}><img src={`${image.imageUrl}&t=${encodeURIComponent(image.updatedAt)}`} alt="服装白底合成图" /><figcaption>{image.sourceAssetNames?.join(' + ') || '服装搭配'}</figcaption></figure>)}</div></div>}
    {message && <div className="four-view-message">{message}</div>}
    {promptDialogOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPromptDialogOpen(false); }}><div className="group-dialog four-view-prompt-dialog"><div className="dialog-icon">✎</div><div className="dialog-copy"><h2>服装白底图提示词</h2><p>可以直接修改内置提示词，控制多件服装在 3:4 白底图中的排列方式。</p></div><label>提示词<textarea autoFocus maxLength={1000} value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} placeholder="输入多件服装合成与排列要求" /></label><div className="prompt-character-count">{customPrompt.length}/1000</div><div className="dialog-actions"><button onClick={() => setCustomPrompt(clothingWhitePrompt)}>恢复默认</button><button onClick={() => setPromptDialogOpen(false)}>保存提示词</button></div></div></div>}
  </section>;
}

function DressedModelStep({ projectKey }) {
  const [modelVersions, setModelVersions] = useState([]);
  const [selectedModelVersionId, setSelectedModelVersionId] = useState('');
  const [clothingImages, setClothingImages] = useState([]);
  const [results, setResults] = useState([]);
  const [customPrompt, setCustomPrompt] = useState(dressedModelPrompt);
  const [scene, setScene] = useState('高级室内');
  const [customScene, setCustomScene] = useState('');
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const selectedModelVersion = modelVersions.find(version => (version.id === null ? 'original' : String(version.id)) === selectedModelVersionId);
  const clothingImage = clothingImages[0];

  async function loadSources() {
    const [versionsResponse, clothingResponse, resultResponse] = await Promise.all([
      fetch(`/api/project/model-four-view/versions?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' }),
      fetch(`/api/project/clothing-white-background?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' }),
      fetch(`/api/project/dressed-model?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' }),
    ]);
    const versionsData = await versionsResponse.json();
    const clothingData = await clothingResponse.json();
    const resultData = await resultResponse.json();
    const versions = versionsResponse.ok ? (versionsData.versions || []) : [];
    setModelVersions(versions);
    setSelectedModelVersionId(current => {
      const values = versions.map(version => version.id === null ? 'original' : String(version.id));
      if (values.includes(current)) return current;
      const savedValue = resultData.image?.sourceModelVersionId ? String(resultData.image.sourceModelVersionId) : '';
      if (values.includes(savedValue)) return savedValue;
      return values[values.length - 1] || '';
    });
    setClothingImages(clothingResponse.ok ? (clothingData.images || []) : []);
    if (resultResponse.ok) {
      setResults(resultData.images || (resultData.image ? [resultData.image] : []));
      if (resultData.image?.scene) {
        if (dressedScenes.includes(resultData.image.scene)) setScene(resultData.image.scene);
        else { setScene('自定义场景'); setCustomScene(resultData.image.scene); }
      }
    }
  }

  useEffect(() => {
    loadSources().catch(() => setMessage('读取模特或服装来源失败'));
    const refresh = () => loadSources().catch(() => {});
    window.addEventListener('project-sources-updated', refresh);
    return () => window.removeEventListener('project-sources-updated', refresh);
  }, [projectKey]);

  async function generateDressedModel() {
    if (!selectedModelVersion || !clothingImage) return;
    setGenerating(true);
    setMessage('正在生成模特穿衣图…');
    try {
      const response = await fetch('/api/project/dressed-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectKey, sourceModelVersionId: selectedModelVersion.id === null ? 'original' : selectedModelVersion.id, clothingImageId: clothingImage.id, scene, customScene, customPrompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '模特穿衣图生成失败');
      setResults(current => [data.image, ...current.filter(item => item.id !== data.image.id)]);
      setMessage(`第 ${results.length + 1} 张穿衣图已保存`);
      window.dispatchEvent(new Event('project-sources-updated'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  return <section className="panel dressed-model-step">
    <div className="four-view-heading"><div><h2>3. 生成模特穿衣图</h2><p>组合模特、服装和场景，可连续生成多张 3:4 全身穿搭图。</p></div><span>GPT Image 2 图生图</span></div>
    <div className="dressed-source-grid">
      <div className={`dressed-source-card ${selectedModelVersion ? '' : 'missing'}`}><div className="dressed-source-title"><b>模特来源</b>{modelVersions.length > 0 && <select value={selectedModelVersionId} onChange={event => setSelectedModelVersionId(event.target.value)}>{modelVersions.map(version => <option key={version.id ?? 'original'} value={version.id === null ? 'original' : String(version.id)}>{version.label}</option>)}</select>}</div>{selectedModelVersion ? <img src={selectedModelVersion.imageUrl} alt="模特四视图来源" /> : <span>请先完成第一步</span>}</div>
      <div className={`dressed-source-card ${clothingImage ? '' : 'missing'}`}><div className="dressed-source-title"><b>服装来源</b><em>3:4 白底合成图</em></div>{clothingImage ? <img src={`${clothingImage.imageUrl}&t=${encodeURIComponent(clothingImage.updatedAt)}`} alt="服装白底合成图" /> : <span>请先完成第二步</span>}</div>
    </div>
    <div className="dressed-scene-picker"><div className="reference-summary"><b>选择拍摄场景</b><span>场景会与人物同时生成</span></div><div className="pills wrap">{dressedScenes.map(item => <SelectPill key={item} active={scene === item} onClick={() => setScene(item)}>{item}</SelectPill>)}</div>{scene === '自定义场景' && <textarea value={customScene} onChange={event => setCustomScene(event.target.value)} maxLength={300} placeholder="描述空间、时间、光线和环境，例如：傍晚的巴黎街角，暖色夕阳，背景行人轻微虚化。" />}</div>
    <div className="dressed-hard-rule"><b>硬性构图</b><span>模特必须手持一部手机，仅遮挡约 20% 面部；手机和手臂不能遮挡服装主体。</span></div>
    <div className="four-view-actions"><button className="four-view-prompt-button" onClick={() => setPromptDialogOpen(true)}>✎ 提示词</button><button className="generate-four-view" disabled={!selectedModelVersion || !clothingImage || generating || (scene === '自定义场景' && !customScene.trim())} onClick={generateDressedModel}>{generating ? '穿衣图生成中…' : results.length > 0 ? '✦ 再生成一张' : '✦ 生成模特穿衣图'}</button></div>
    {results.length > 0 && <div className="dressed-model-results"><div className="result-title"><b>模特穿衣图</b><span>共 {results.length} 张 · 可在下一步选择首帧</span></div><div>{results.map((result, index) => <figure key={result.id}><img src={`${result.imageUrl}&t=${encodeURIComponent(result.updatedAt)}`} alt={`模特穿衣效果图 ${results.length - index}`} /><figcaption><b>穿衣图 {results.length - index}</b><span>{result.scene || '未标注场景'} · 3:4</span></figcaption></figure>)}</div></div>}
    {message && <div className="four-view-message">{message}</div>}
    {promptDialogOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPromptDialogOpen(false); }}><div className="group-dialog four-view-prompt-dialog"><div className="dialog-icon">✎</div><div className="dialog-copy"><h2>模特穿衣图提示词</h2><p>可以修改人物一致性、服装还原、姿势和场景融合要求。</p></div><label>提示词<textarea autoFocus maxLength={1200} value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} placeholder="输入模特穿衣图生成要求" /></label><div className="prompt-character-count">{customPrompt.length}/1200</div><div className="dialog-actions"><button onClick={() => setCustomPrompt(dressedModelPrompt)}>恢复默认</button><button onClick={() => setPromptDialogOpen(false)}>保存提示词</button></div></div></div>}
  </section>;
}

const sceneVideoScripts = {
  '高级室内': ['高级室内展示', '室内轻推镜头', '模特在高级室内自然站立，先轻微整理袖口，再从容向前走一步并缓慢侧身，最后面向镜头定格。镜头沿室内空间平稳轻推，保留落地窗、石材和木质陈设的层次，不改变原场景。'],
  '城市街拍': ['城市街拍漫步', '街道跟随镜头', '模特沿当前城市街道自然向前走两步，短暂停留并轻微侧身，随后回望镜头。镜头低速后退跟随，保留原有建筑、街道光线和背景景深，不切换地点。'],
  '精品咖啡馆': ['咖啡馆随拍', '室内生活化镜头', '模特在当前咖啡馆内自然调整站姿，轻触桌沿或椅背，随后缓慢侧身并看向镜头。镜头小幅横移，保留原有桌椅、暖色光线和咖啡馆氛围，不新增道具。'],
  '商场橱窗': ['橱窗时尚展示', '橱窗环绕镜头', '模特在当前商场橱窗前从容走近，侧身观察橱窗后自然回望镜头，最后展示完整穿搭。镜头轻微环绕，保留原有橱窗灯光、反射和商场空间，不更换背景。'],
  '极简展厅': ['极简展厅定格', '展厅平移镜头', '模特在当前极简展厅内缓慢转身约 30 度，轻微调整手臂姿态并回到正面定格。镜头平稳横移，保留原有中性色墙面、空间透视和柔和侧光，不添加陈设。'],
};

function videoScriptForScene(scene = '') {
  return sceneVideoScripts[scene] || [`${scene || '自定义场景'}展示`, '场景自适应镜头', `模特在当前${scene || '拍摄场景'}中自然向前走一步，缓慢侧身展示完整穿搭后回到正面定格。镜头根据现有空间平稳跟随，严格保留原图中的环境、光线、陈设和透视，不切换或重构场景。`];
}

function SeedanceVideoStep({ projectKey, ratio, setRatio }) {
  const [dressedModels, setDressedModels] = useState([]);
  const [selectedDressedModelId, setSelectedDressedModelId] = useState('');
  const [scriptPrompts, setScriptPrompts] = useState({});
  const [videoTasks, setVideoTasks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [generationError, setGenerationError] = useState('');
  const dressedModel = dressedModels.find(image => String(image.id) === selectedDressedModelId) || dressedModels[0] || null;
  const selectedScript = videoScriptForScene(dressedModel?.scene);
  const selectedScriptIndex = Math.max(0, Object.keys(sceneVideoScripts).indexOf(dressedModel?.scene));
  const scriptPromptKey = `${dressedModel?.id || 'none'}:${selectedScript[0]}`;
  const scriptPrompt = scriptPrompts[scriptPromptKey] ?? selectedScript[2];
  const selectedTask = videoTasks.find(task => task.shotName === selectedScript[0] && Number(task.dressedModelImageId) === Number(dressedModel?.id));
  const completedVideos = videoTasks.filter(task => task.status === 'succeeded' && task.videoUrl);

  async function loadVideoSources() {
    const [imageResponse, tasksResponse] = await Promise.all([
      fetch(`/api/project/dressed-model?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' }),
      fetch(`/api/project/videos?projectKey=${encodeURIComponent(projectKey)}`, { cache: 'no-store' }),
    ]);
    const imageData = await imageResponse.json();
    const taskData = await tasksResponse.json();
    if (imageResponse.ok) {
      const images = imageData.images || (imageData.image ? [imageData.image] : []);
      setDressedModels(images);
      setSelectedDressedModelId(current => images.some(image => String(image.id) === current) ? current : (images[0] ? String(images[0].id) : ''));
    }
    if (tasksResponse.ok) setVideoTasks(taskData.tasks || []);
  }

  useEffect(() => {
    loadVideoSources().catch(() => setMessage('读取穿搭图或视频任务失败'));
    const refresh = () => loadVideoSources().catch(() => {});
    window.addEventListener('project-sources-updated', refresh);
    return () => window.removeEventListener('project-sources-updated', refresh);
  }, [projectKey]);

  function updateTask(nextTask) {
    setVideoTasks(current => {
      const without = current.filter(task => task.id !== nextTask.id);
      return [...without, nextTask].sort((a, b) => a.shotIndex - b.shotIndex);
    });
  }

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  async function pollTask(task) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await wait(attempt === 0 ? 1500 : 3000);
      const response = await fetch(`/api/project/videos/${task.id}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.task) updateTask(data.task);
      if (data.task?.status === 'succeeded' || data.task?.status === 'failed') return data.task;
    }
    updateTask({ ...task, status: 'failed', errorMessage: '轮询超时，请稍后重试' });
    return { ...task, status: 'failed' };
  }

  async function submitScript([scriptName, , scriptPrompt], scriptIndex) {
    const response = await fetch('/api/project/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectKey, dressedModelImageId: dressedModel.id, scene: dressedModel.scene, shotIndex: scriptIndex, shotName: scriptName, prompt: scriptPrompt, ratio, duration: 5, resolution: '480p', camerafixed: false, watermark: false }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `${scriptName}提交失败`);
    updateTask(data.task);
    return data.task;
  }

  async function generateVideo() {
    if (!dressedModel || generating) return;
    setGenerating(true);
    setGenerationError('');
    setMessage(`正在提交“${selectedScript[0]}”视频任务…`);
    try {
      const task = await submitScript([selectedScript[0], selectedScript[1], scriptPrompt.trim()], selectedScriptIndex);
      setMessage('任务已提交，正在等待 Seedance 生成…');
      const finishedTask = await pollTask(task);
      if (finishedTask.status === 'succeeded') setMessage('视频生成完成，已显示在下方并保存到“模特视频”文件夹');
      else setGenerationError(finishedTask.errorMessage || '视频生成失败');
    } catch (error) {
      setGenerationError(error.message || '视频任务提交失败');
      setMessage('');
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 6000);
    }
  }

  return <section className="panel seedance-video-step">
    <div className="four-view-heading"><div><h2>4. 生成模特视频</h2><p>根据穿衣图的拍摄场景自动匹配脚本，每次生成一个完整视频。</p></div><span>Seedance · 5秒 / 480p</span></div>
    <div className="seedance-controls"><label>视频比例<select value={ratio} onChange={event => setRatio(event.target.value)}><option value="9:16">9:16 竖版</option><option value="1:1">1:1 方形</option><option value="16:9">16:9 横版</option></select></label><span>单镜头 5 秒 · 480p · 无声 · 关闭水印 · 机位平稳跟随</span></div>
    <div className="seedance-frame"><div className={dressedModel ? '' : 'missing'}>{dressedModel ? <img src={`${dressedModel.imageUrl}&t=${encodeURIComponent(dressedModel.updatedAt)}`} alt="Seedance 首帧" /> : <span>请先完成第三步模特穿衣图</span>}</div><div><b>统一首帧</b><p>所有镜头使用同一张穿搭图，保持人物、服装、场景和手机位置一致。</p>{dressedModels.length > 1 && <label className="seedance-frame-select">选择穿衣图<select value={selectedDressedModelId} onChange={event => setSelectedDressedModelId(event.target.value)}>{dressedModels.map((image, index) => <option key={image.id} value={image.id}>穿衣图 {dressedModels.length - index} · {image.scene}</option>)}</select></label>}</div></div>
    <div className="video-script-heading"><b>场景匹配脚本</b><span>根据穿衣图拍摄场景自动选择</span></div>
    <div className="scene-script-match"><div><small>当前拍摄场景</small><b>{dressedModel?.scene || '等待选择穿衣图'}</b></div><span>→</span><div><small>内置视频脚本</small><b>{selectedScript[0]}</b><em>{selectedScript[1]}</em></div><i className={`task-status ${selectedTask?.status || 'ready'}`}>{selectedTask?.status === 'succeeded' ? '已生成' : selectedTask?.status === 'failed' ? '失败' : selectedTask?.status === 'running' || selectedTask?.status === 'submitted' ? '生成中' : '待生成'}</i></div>
    <div className="selected-video-script"><div className="video-script-copy"><small>已锁定场景 · {dressedModel?.scene || '未选择'}</small><div className="video-script-title"><h3>{selectedScript[0]}</h3><button type="button" disabled={!dressedModel || scriptPrompt === selectedScript[2]} onClick={() => setScriptPrompts(current => ({ ...current, [scriptPromptKey]: selectedScript[2] }))}>恢复默认</button></div><label>脚本提示词<textarea disabled={!dressedModel || generating} maxLength={1200} value={scriptPrompt} onChange={event => setScriptPrompts(current => ({ ...current, [scriptPromptKey]: event.target.value }))} /></label><span className="video-script-count">{scriptPrompt.length}/1200</span></div><div className="video-script-preview">{selectedTask?.videoUrl ? <video controls playsInline src={selectedTask.videoUrl} /> : <div><span>▶</span><b>{selectedTask?.errorMessage || '尚未生成此场景视频'}</b></div>}</div></div>
    {generationError && <div className="video-generation-error" role="alert"><span>!</span><div><b>视频没有生成成功</b><p>{generationError}</p></div><button onClick={() => setGenerationError('')}>×</button></div>}
    <button className="generate-four-view seedance-generate" disabled={!dressedModel || generating || !scriptPrompt.trim()} onClick={generateVideo}>{generating ? 'Seedance 生成中…' : selectedTask?.status === 'succeeded' ? `✦ 重新生成“${selectedScript[0]}”` : `✦ 生成“${selectedScript[0]}”视频`}</button>
    <div className="generated-video-library"><div className="result-title"><b>已生成视频</b><span>{completedVideos.length > 0 ? `共 ${completedVideos.length} 个 · 同时保存在“模特视频”文件夹` : '生成成功后会显示在这里'}</span></div>{completedVideos.length === 0 ? <div className="generated-video-empty">暂时没有生成成功的视频</div> : <div>{completedVideos.map(task => <article key={task.id}><video controls playsInline src={task.videoUrl} /><div><span><b>{task.shotName}</b><small>穿衣图 {task.dressedModelImageId} · 5 秒</small></span><a href={task.videoUrl} download>下载视频</a></div></article>)}</div>}</div>
    {message && <div className="four-view-message">{message}</div>}
  </section>;
}

const batchScenes = ['城市街拍', '精品咖啡馆', '商场橱窗', '极简展厅', '高级室内'];
const batchExecutionSteps = ['模特四视图', '服装白底图', '模特穿衣图'];
function BatchGenerationDialog({ onClose }) {
  const [step, setStep] = useState(0);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [globalScene, setGlobalScene] = useState('城市街拍');
  const [ratio, setRatio] = useState('9:16');
  const [rowScenes, setRowScenes] = useState({});
  const [dressedPrompts, setDressedPrompts] = useState({});
  const [runStarted, setRunStarted] = useState(false);
  const [executionTick, setExecutionTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/assets/groups?type=%E6%90%AD%E9%85%8D', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (!active) return;
        const nextGroups = (data.groups || []).filter(group => !group.hasGeneratedOutput);
        setGroups(nextGroups);
        setSelectedIds(nextGroups.filter(group => group.modelCount > 0 && group.clothingCount > 0).map(group => group.id));
      })
      .catch(() => {
        if (!active) return;
        setGroups([]);
        setSelectedIds([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const selectedGroups = groups.filter(group => selectedIds.includes(group.id));
  const eligibleGroups = groups.filter(group => group.modelCount > 0 && group.clothingCount > 0);
  const totalExecutionSteps = selectedGroups.length * batchExecutionSteps.length;
  const promptFor = (group, scene) => `使用“${group.name}”中的模特和整套服装，生成${scene}场景中的竖版全身穿搭图，保持人物身份、服装款式和环境光线一致。`;
  const toggleGroup = group => {
    if (group.modelCount < 1 || group.clothingCount < 1) return;
    setSelectedIds(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id]);
  };

  useEffect(() => {
    if (!runStarted || executionTick >= totalExecutionSteps) return undefined;
    const timer = setTimeout(() => setExecutionTick(current => current + 1), 850);
    return () => clearTimeout(timer);
  }, [runStarted, executionTick, totalExecutionSteps]);

  function startSimulation() {
    setExecutionTick(0);
    setRunStarted(true);
    setStep(3);
  }

  return <div className="batch-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title">
      <header className="batch-dialog-header"><div><span>仅模拟前三步 · 不生成视频</span><h2 id="batch-dialog-title">批量生成作品</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
      <div className="batch-step-tabs" role="tablist" aria-label="批量生成步骤">{['选择搭配', '确认任务', '执行进度'].map((label, index) => { const targetStep = [0, 2, 3][index]; return <button key={label} type="button" role="tab" disabled={(index === 2 && !runStarted) || (runStarted && index < 2)} aria-selected={step === targetStep} className={step === targetStep ? 'active' : ''} onClick={() => setStep(targetStep)}><i>{index + 1}</i><span>{label}</span></button>; })}</div>

      <div className="batch-dialog-body">
        {step === 0 && <div className="batch-select-step"><div className="batch-section-title"><div><h3>选择尚未生成的素材搭配</h3><p>已经生成过的搭配不会在这里重复出现。</p></div>{eligibleGroups.length > 0 && <button type="button" onClick={() => setSelectedIds(selectedIds.length === eligibleGroups.length ? [] : eligibleGroups.map(group => group.id))}>{selectedIds.length === eligibleGroups.length ? '取消全选' : '全选可用'}</button>}</div>{loading ? <div className="batch-loading">正在读取搭配…</div> : groups.length === 0 ? <div className="batch-empty-state"><span>✓</span><h3>没有待生成的素材组</h3><p>现有搭配都已经生成，可以先到素材库新建搭配。</p></div> : <div className="batch-group-grid">{groups.map(group => { const ready = group.modelCount > 0 && group.clothingCount > 0; const checked = selectedIds.includes(group.id); return <button type="button" key={group.id} disabled={!ready} className={`batch-group-card ${checked ? 'selected' : ''}`} onClick={() => toggleGroup(group)}><i>{checked ? '✓' : ''}</i><div><b>{group.name}</b><span>模特 {group.modelCount || 0} · 服装 {group.clothingCount || 0}</span></div><em>{ready ? '待生成' : '素材不完整'}</em></button>; })}</div>}</div>}

        {step === 1 && <div className="batch-settings-step"><div className="batch-global-settings"><label>默认拍摄场景<select value={globalScene} onChange={event => setGlobalScene(event.target.value)}>{batchScenes.map(scene => <option key={scene}>{scene}</option>)}</select></label><label>穿衣图比例<select value={ratio} onChange={event => setRatio(event.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label><label>执行内容<span>前 3 个生成步骤</span></label><label>生成方式<span>按素材组依次执行</span></label></div><div className="batch-edit-list">{selectedGroups.map((group, index) => { const scene = rowScenes[group.id] || globalScene; const dressedPrompt = dressedPrompts[group.id] ?? promptFor(group, scene); return <article key={group.id}><div className="batch-row-number">{String(index + 1).padStart(2, '0')}</div><div className="batch-row-fields"><div><b>{group.name}</b><select value={scene} onChange={event => setRowScenes(current => ({ ...current, [group.id]: event.target.value }))}>{batchScenes.map(item => <option key={item}>{item}</option>)}</select></div><label>模特穿衣图提示词<textarea rows={2} value={dressedPrompt} onChange={event => setDressedPrompts(current => ({ ...current, [group.id]: event.target.value }))} /></label></div></article>; })}</div></div>}

        {step === 2 && <div className="batch-confirm-step"><div className="batch-summary"><div><span>将创建</span><b>{selectedGroups.length}</b><small>个作品</small></div><div><span>每个作品</span><b>3</b><small>个生成步骤</small></div><div><span>停止在</span><b>穿衣图</b><small>不生成视频</small></div></div><div className="batch-task-list"><div className="batch-task-head"><span>作品</span><span>拍摄场景</span><span>生成内容</span><span>状态</span></div>{selectedGroups.map(group => <div className="batch-task-row" key={group.id}><b>{group.name}</b><span>{rowScenes[group.id] || globalScene}</span><span>四视图 · 白底图 · 穿衣图</span><em>待执行</em></div>)}</div><div className="batch-no-video-note">系统完成模特穿衣图后自动停止，不会提交视频任务。</div></div>}

        {step === 3 && <div className="batch-execution-step"><div className="batch-execution-overview"><div><h3>{executionTick >= totalExecutionSteps ? '全部执行完成' : '正在批量生成'}</h3><p>{executionTick >= totalExecutionSteps ? '所有作品已停止在“模特穿衣图”。' : '按顺序生成前三步，关闭弹窗不会发起真实任务。'}</p></div><strong>{totalExecutionSteps === 0 ? 0 : Math.round((executionTick / totalExecutionSteps) * 100)}%</strong></div><div className="batch-execution-progress"><i style={{ width: `${totalExecutionSteps === 0 ? 0 : (executionTick / totalExecutionSteps) * 100}%` }} /></div><div className="batch-execution-list">{selectedGroups.map((group, groupIndex) => { const localProgress = Math.max(0, Math.min(3, executionTick - groupIndex * 3)); const isActive = executionTick >= groupIndex * 3 && executionTick < (groupIndex + 1) * 3; return <article key={group.id}><header><div><span>{String(groupIndex + 1).padStart(2, '0')}</span><b>{group.name}</b></div><em className={localProgress === 3 ? 'complete' : isActive ? 'running' : ''}>{localProgress === 3 ? '已完成' : isActive ? '生成中' : '等待中'}</em></header><div className="batch-execution-stages">{batchExecutionSteps.map((label, stageIndex) => { const stageState = stageIndex < localProgress ? 'done' : isActive && stageIndex === localProgress ? 'running' : ''; return <span className={stageState} key={label}><i>{stageState === 'done' ? '✓' : stageIndex + 1}</i><b>{label}</b><small>{stageState === 'done' ? '已完成' : stageState === 'running' ? '正在生成…' : '等待中'}</small></span>; })}</div></article>; })}</div><div className="batch-simulated-notice">仅为 UI 进度模拟，没有调用图片或视频模型。</div></div>}
      </div>

      <footer className="batch-dialog-footer"><span>{step === 3 ? `已完成 ${executionTick}/${totalExecutionSteps} 个步骤` : `已选 ${selectedGroups.length} 个搭配`}</span><div>{step === 3 ? <button type="button" className="batch-next" onClick={onClose}>{executionTick >= totalExecutionSteps ? '完成' : '关闭'}</button> : <><button type="button" className="batch-cancel" onClick={step === 0 ? onClose : () => setStep(2)}>{step === 0 ? '取消' : '上一步'}</button>{step < 2 ? <button type="button" className="batch-next" disabled={selectedGroups.length === 0} onClick={() => setStep(2)}>下一步</button> : <button type="button" className="batch-next" disabled={selectedGroups.length === 0} onClick={startSimulation}>{`开始生成 ${selectedGroups.length} 个作品`}</button>}</>}</div></footer>
    </section>
  </div>;
}

function ProjectList({ onOpen }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState(null);
  const [targetProject, setTargetProject] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  async function loadProjects() {
    setLoading(true);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '读取项目失败');
      setProjects(data.projects || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProjects(); }, []);

  function openCreate() {
    setDialogMode('create');
    setTargetProject(null);
    setName('');
    setDescription('');
    setError('');
  }

  function openEdit(project) {
    setDialogMode('edit');
    setTargetProject(project);
    setName(project.name);
    setDescription(project.description || '');
    setError('');
  }

  function openDelete(project) {
    setDialogMode('delete');
    setTargetProject(project);
    setError('');
  }

  async function saveProject(event) {
    event.preventDefault();
    if (!name.trim()) { setError('请输入作品名称'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/projects', { method: dialogMode === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: targetProject?.id, name: name.trim(), description: description.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存项目失败');
      setDialogMode(null);
      await loadProjects();
      if (dialogMode === 'create') onOpen(data.project);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeProject() {
    if (!targetProject) return;
    setSaving(true);
    try {
      const response = await fetch('/api/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: targetProject.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除项目失败');
      setDialogMode(null);
      await loadProjects();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="projects-view">
    <div className="projects-heading"><h1>我的作品</h1><div className="projects-heading-actions"><button type="button" className="batch-generate-button" onClick={() => setBatchDialogOpen(true)}>✧ 批量生成</button><button type="button" className="new-project-button" onClick={openCreate}>＋ 新建作品</button></div></div>
    {loading ? <div className="projects-empty">正在读取作品…</div> : projects.length === 0 ? <div className="projects-empty"><b>还没有作品</b><span>新建作品后开始制作服装视频。</span><button onClick={openCreate}>新建作品</button></div> : <div className="project-table"><div className="project-table-head"><span>作品名称</span><span>制作进度</span><span>更新时间</span><span>操作</span></div>{projects.map(project => { const completed = [project.hasModelView, project.hasClothing, project.hasDressedModel, project.completedVideos >= 4].filter(Boolean).length; return <div key={project.id} className="project-row" onClick={() => onOpen(project)}><div className="project-list-name"><i>✦</i><div><b>{project.name}</b><span>{project.description || '服装视频作品'}</span></div></div><div className="project-list-progress"><div><i><b style={{ width: `${completed * 25}%` }} /></i><span>{completed}/4 步</span></div><small>{completed === 4 ? '已完成' : `进行中 · ${completed * 25}%`}</small></div><time>{new Date(project.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><div className="project-list-actions"><button onClick={event => { event.stopPropagation(); openEdit(project); }}>编辑</button><button onClick={event => { event.stopPropagation(); openDelete(project); }}>删除</button><button onClick={event => { event.stopPropagation(); onOpen(project); }}>打开</button></div></div>; })}</div>}
    {error && !dialogMode && <div className="library-notice">{error}</div>}
    {dialogMode && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDialogMode(null); }}><form className={`group-dialog ${dialogMode === 'delete' ? 'delete-dialog' : ''}`} onSubmit={saveProject}><div className="dialog-icon">{dialogMode === 'delete' ? '!' : '▣'}</div><div className="dialog-copy"><h2>{dialogMode === 'create' ? '新建作品' : dialogMode === 'edit' ? '编辑作品' : '删除作品'}</h2><p>{dialogMode === 'delete' ? `删除“${targetProject?.name}”后，作品中的生成记录将一并删除。` : '作品名称用于区分不同的服装视频制作任务。'}</p></div>{dialogMode !== 'delete' && <><label>作品名称<input autoFocus maxLength={40} value={name} onChange={event => { setName(event.target.value); setError(''); }} placeholder="例如：春季轻奢女装" /></label><label className="project-description-field">作品说明<input maxLength={120} value={description} onChange={event => setDescription(event.target.value)} placeholder="选填，例如：小红书春季穿搭视频" /></label></>}{error && <span className="group-error">{error}</span>}<div className="dialog-actions"><button type="button" disabled={saving} onClick={() => setDialogMode(null)}>取消</button>{dialogMode === 'delete' ? <button type="button" className="danger-button" disabled={saving} onClick={removeProject}>{saving ? '删除中…' : '确认删除'}</button> : <button type="submit" disabled={saving}>{saving ? '保存中…' : dialogMode === 'create' ? '创建并打开' : '保存修改'}</button>}</div></form></div>}
    {batchDialogOpen && <BatchGenerationDialog onClose={() => setBatchDialogOpen(false)} />}
  </section>;
}

function ModelConfig() {
  const [activeModel, setActiveModel] = useState('多模态模型');
  const [showKey, setShowKey] = useState(false);
  const [config, setConfig] = useState({ baseUrl: '', modelName: '', apiKey: '', enabled: true, hasApiKey: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const isVision = activeModel === '多模态模型';
  const isTextImage = activeModel === 'GPT Image 2 文生图';
  const isSeedance = activeModel === 'Seedance 视频模型';
  const modelType = isVision ? 'multimodal' : isTextImage ? 'gpt-image-2-text' : isSeedance ? 'seedance' : 'gpt-image-2';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage('');
    fetch(`/api/model-config?type=${modelType}`)
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data.config) setConfig({ ...data.config, apiKey: '' });
      })
      .catch(() => { if (!cancelled) setMessage('读取配置失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [modelType]);

  async function saveConfig(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/model-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, modelType }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      setConfig({ ...data.config, apiKey: '' });
      setMessage('配置已保存到 SQLite');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 2800);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage('正在连接模型服务…');
    try {
      const response = await fetch('/api/model-config/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelType, baseUrl: config.baseUrl, modelName: config.modelName, apiKey: config.apiKey }) });
      const data = await response.json();
      setMessage(`${data.ok ? '✓' : '✕'} ${data.message}${data.latency ? ` · ${data.latency}ms` : ''}`);
    } catch {
      setMessage('✕ 测试连接请求失败');
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  return <section className="model-config-view">
    <div className="config-heading"><div><p>模型配置</p><h1>AI 模型服务</h1><span>配置工作台所使用的多模态理解与图像生成模型</span></div><div className="config-status"><i /> SQLite 本地存储</div></div>
    <div className="model-config-layout">
      <aside className="model-picker"><b>模型类型</b><button className={isVision ? 'active' : ''} onClick={() => setActiveModel('多模态模型')}><i>◉</i><span><strong>多模态模型</strong><small>图片理解与提示词分析</small></span><em>›</em></button><button className={!isVision && !isTextImage && !isSeedance ? 'active' : ''} onClick={() => setActiveModel('GPT Image 2 图生图')}><i>✦</i><span><strong>GPT Image 2 图生图</strong><small>图片编辑与风格转换</small></span><em>›</em></button><button className={isTextImage ? 'active' : ''} onClick={() => setActiveModel('GPT Image 2 文生图')}><i>✧</i><span><strong>GPT Image 2 文生图</strong><small>根据文字生成模特图片</small></span><em>›</em></button><button className={isSeedance ? 'active' : ''} onClick={() => setActiveModel('Seedance 视频模型')}><i>▶</i><span><strong>Seedance 视频模型</strong><small>图生视频，5秒 / 480p</small></span><em>›</em></button></aside>
      <form className={`config-form ${loading ? 'config-loading' : ''}`} onSubmit={saveConfig}>
        <div className="config-card-title"><div className="model-logo">{isVision ? '◉' : isTextImage ? '✧' : isSeedance ? '▶' : '✦'}</div><div><h2>{activeModel}</h2><p>{isVision ? '用于识别服装、分析模特图片和生成视频提示词' : isTextImage ? '用于根据文字描述生成高质量、可复用的 AI 模特素材' : isSeedance ? '用于将模特穿搭图生成 5 秒 480p 静音视频' : '用于图片编辑、服装替换和视觉风格转换'}</p></div><label className="switch"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /><span /></label></div>
        <div className="form-section"><h3>连接配置</h3><div className="field-grid"><label className="full">API 地址<input value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="请输入 API Base URL" /></label><label>模型名称<input value={config.modelName} onChange={e => setConfig({ ...config, modelName: e.target.value })} /></label><label>API Key<div className="secret-input"><input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={config.hasApiKey ? '已安全保存，留空则不修改' : '请输入 API Key'} /><button type="button" onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button></div></label></div></div>
        <div className="config-actions"><button type="button" className="test-button" onClick={testConnection} disabled={loading || testing}>{testing ? '测试中…' : '测试连接'}</button><button type="submit" className="save-config" disabled={loading || saving}>{saving ? '保存中…' : '保存配置'}</button>{message && <span className="save-toast">{message}</span>}</div>
      </form>
    </div>
  </section>;
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeNav, setActiveNav] = useState(pathname.startsWith('/assets') ? '素材' : pathname.startsWith('/model-config') ? '模型' : '作品');
  const [activeProject, setActiveProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(pathname.startsWith('/projects/'));
  const [ratio, setRatio] = useState('9:16');
  const [generated, setGenerated] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
  const [activePairGroupId, setActivePairGroupId] = useState('');
  const [pairGroupLocked, setPairGroupLocked] = useState(false);

  useEffect(() => {
    if (pathname === '/') { router.replace('/projects'); return; }
    if (pathname.startsWith('/assets')) { setActiveNav('素材'); setActiveProject(null); setProjectLoading(false); return; }
    if (pathname.startsWith('/model-config')) { setActiveNav('模型'); setActiveProject(null); setProjectLoading(false); return; }
    setActiveNav('作品');
    const match = pathname.match(/^\/projects\/([^/]+)$/);
    if (!match) { setActiveProject(null); setActivePairGroupId(''); setPairGroupLocked(false); setProjectLoading(false); return; }
    setActiveWorkflowStep(0);
    setActivePairGroupId('');
    setPairGroupLocked(false);
    setProjectLoading(true);
    const projectId = decodeURIComponent(match[1]);
    fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(response => response.json().then(data => ({ response, data }))).then(({ response, data }) => {
      if (response.ok) {
        setActiveProject(data.project);
        setActivePairGroupId(data.project.groupId ? String(data.project.groupId) : '');
        setPairGroupLocked(Boolean(data.project.hasModelView));
      }
      else router.replace('/projects');
    }).catch(() => router.replace('/projects')).finally(() => setProjectLoading(false));
  }, [pathname, router]);

  function navigate(label) {
    const destinations = { 作品: '/projects', 素材: '/assets', 模型: '/model-config' };
    router.push(destinations[label]);
  }

  function selectWorkflowStep(index) {
    setActiveWorkflowStep(index);
  }

  function selectPairGroup(groupId) {
    if (pairGroupLocked) return;
    setActivePairGroupId(groupId);
    if (!activeProject) return;
    fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeProject.id, groupId: groupId || null }) })
      .then(response => response.json().then(data => ({ response, data })))
      .then(({ response, data }) => { if (response.ok) setActiveProject(data.project); })
      .catch(() => {});
  }

  function lockPairGroup() {
    setPairGroupLocked(true);
    setActiveProject(current => current ? { ...current, hasModelView: true } : current);
  }

  function handleWorkflowKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? workflowSteps.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + workflowSteps.length) % workflowSteps.length;
    setActiveWorkflowStep(nextIndex);
    document.getElementById(`workflow-tab-${nextIndex}`)?.focus();
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img className="brand-logo" src="/chuanying-logo.png" alt="" aria-hidden="true" /><span>穿影</span></div>
      <nav>{nav.map(([icon, label]) => <button key={label} className={activeNav === label ? 'nav-item selected' : 'nav-item'} onClick={() => navigate(label)}><span>{icon}</span>{label}</button>)}</nav>
    </aside>

    <section className="content">
      {activeNav === '作品' && activeProject && <header className="topbar"><div className="crumb"><button className="back" onClick={() => { setGenerated(false); router.push('/projects'); }}>‹</button><span>服装视频作品</span><b>/</b><strong>{activeProject.name}</strong></div><div className="header-actions"><button className="save">▣ &nbsp;自动保存</button><button className="generate" onClick={() => setGenerated(true)}>✧ &nbsp; {generated ? '视频生成中' : '生成视频'}</button></div></header>}

      {activeNav === '素材' && <MaterialLibrary />}
      {activeNav === '模型' && <ModelConfig />}
      {activeNav === '作品' && !activeProject && (projectLoading ? <div className="projects-view"><div className="projects-empty">正在打开作品…</div></div> : <ProjectList onOpen={project => { setGenerated(false); router.push(`/projects/${encodeURIComponent(project.id)}`); }} />)}
      {activeNav === '作品' && activeProject && <div className="workspace-grid">
        <div className="left-column">
          <div className="workflow-tabs" role="tablist" aria-label="制作步骤">
            {workflowSteps.map(([title, description], index) => <button
              id={`workflow-tab-${index}`}
              key={title}
              type="button"
              role="tab"
              aria-selected={activeWorkflowStep === index}
              aria-controls={`workflow-panel-${index}`}
              tabIndex={activeWorkflowStep === index ? 0 : -1}
              className={activeWorkflowStep === index ? 'active' : ''}
              onClick={() => selectWorkflowStep(index)}
              onKeyDown={event => handleWorkflowKeyDown(event, index)}
            ><span>{index + 1}</span><span><b>{title}</b><small>{description}</small></span></button>)}
          </div>
          <div id="workflow-panel-0" role="tabpanel" aria-labelledby="workflow-tab-0" hidden={activeWorkflowStep !== 0}><ModelFourViewStep projectKey={activeProject.id} groupId={activePairGroupId} setGroupId={selectPairGroup} groupLocked={pairGroupLocked} onFourViewGenerated={lockPairGroup} /></div>
          <div id="workflow-panel-1" role="tabpanel" aria-labelledby="workflow-tab-1" hidden={activeWorkflowStep !== 1}><ClothingWhiteBackgroundStep projectKey={activeProject.id} groupId={activePairGroupId} setGroupId={selectPairGroup} groupLocked={pairGroupLocked} /></div>
          <div id="workflow-panel-2" role="tabpanel" aria-labelledby="workflow-tab-2" hidden={activeWorkflowStep !== 2}><DressedModelStep projectKey={activeProject.id} /></div>
          <div id="workflow-panel-3" role="tabpanel" aria-labelledby="workflow-tab-3" hidden={activeWorkflowStep !== 3}><SeedanceVideoStep projectKey={activeProject.id} ratio={ratio} setRatio={setRatio} /></div>
        </div>
      </div>}
    </section>
  </main>;
}
